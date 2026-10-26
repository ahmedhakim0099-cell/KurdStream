import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Password",
};

const ADMIN_PASSWORD = "admin123";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function srtToVtt(srt: string): string {
  let vtt = "WEBVTT\n\n";
  let body = srt.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  body = body.replace(/^WEBVTT\s*/i, "");

  const blocks = body.split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.split("\n");
    let timeLineIdx = 0;

    if (lines[0] && /^\d+$/.test(lines[0].trim())) {
      timeLineIdx = 1;
    }

    const timeLine = lines[timeLineIdx];
    if (!timeLine || !timeLine.includes("-->")) continue;

    const convertedTime = timeLine
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
      .replace(/(\d{2}:\d{2}),(\d{3})/g, "00:$1.$2");

    const textLines = lines.slice(timeLineIdx + 1);
    vtt += convertedTime + "\n";
    vtt += textLines.join("\n") + "\n\n";
  }

  return vtt.trim() + "\n";
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function vttResponse(content: string) {
  return new Response(content, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/vtt; charset=utf-8" },
  });
}

function checkAdmin(auth: string | null): boolean {
  if (!auth) return false;
  return auth === ADMIN_PASSWORD;
}

/**
 * Build the Storage file path for a subtitle.
 * Movies: movie-{tmdbId}.vtt
 * TV: tv-{tmdbId}-s{season}e{episode}.vtt
 */
function storagePath(mediaType: string, tmdbId: number, season?: number, episode?: number): string {
  return mediaType === 'tv'
    ? `tv-${tmdbId}-s${season}e${episode}.vtt`
    : `movie-${tmdbId}.vtt`;
}

/**
 * Get the public URL for a subtitle file in the subtitles bucket.
 */
function publicUrl(path: string): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/storage/v1/object/public/subtitles/${path}`;
}

/**
 * Upload VTT content to the subtitles Storage bucket.
 * The bucket must be created manually in the Supabase Dashboard.
 * Returns the public URL of the uploaded file.
 */
async function uploadToStorage(
  vttContent: string,
  tmdbId: number,
  mediaType: string,
  season?: number,
  episode?: number,
): Promise<string> {
  const path = storagePath(mediaType, tmdbId, season, episode);
  const { error } = await supabase.storage
    .from("subtitles")
    .upload(path, vttContent, {
      contentType: "text/vtt",
      upsert: true,
    });
  if (error) {
    console.error("Storage upload error:", error.message);
  }
  return publicUrl(path);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/(functions\/v1\/)?subtitles-api/, "").replace(/^\/subtitles-api/, "");
    const segments = path.split("/").filter(Boolean);

    // GET /subtitles/:tmdbId — public, fetch subtitles for a movie or episode
    // GET /subtitles/:tmdbId?season=X&episode=Y
    if (req.method === "GET" && segments.length === 1 && /^\d+$/.test(segments[0])) {
      const tmdbId = parseInt(segments[0]);
      const season = url.searchParams.get("season");
      const episode = url.searchParams.get("episode");

      let query = supabase
        .from("subtitles")
        .select("*")
        .eq("tmdb_id", tmdbId);

      if (season) query = query.eq("season_number", parseInt(season));
      if (episode) query = query.eq("episode_number", parseInt(episode));

      const { data, error } = await query;

      if (error) return json({ error: error.message }, 500);

      const format = url.searchParams.get("format");
      if (format === "vtt" && data && data.length > 0) {
        return vttResponse(data[0].content);
      }

      return json({ subtitles: data });
    }

    // GET /subtitles — admin list all
    if (req.method === "GET" && segments.length === 0) {
      const auth = req.headers.get("X-Admin-Password");
      if (!checkAdmin(auth)) return json({ error: "Unauthorized" }, 401);

      const { data, error } = await supabase
        .from("subtitles")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) return json({ error: error.message }, 500);
      return json({ subtitles: data });
    }

    // POST /subtitles — admin upload/create
    if (req.method === "POST" && segments.length === 0) {
      const auth = req.headers.get("X-Admin-Password");
      if (!checkAdmin(auth)) return json({ error: "Unauthorized" }, 401);

      const body = await req.json();
      const { tmdb_id, media_type, season_number, episode_number, title, content, language } = body;

      if (!tmdb_id || !media_type || !title || !content) {
        return json({ error: "Missing required fields: tmdb_id, media_type, title, content" }, 400);
      }

      // Convert SRT to VTT if needed
      let vttContent = content;
      if (content.trim().toUpperCase().startsWith("WEBVTT")) {
        vttContent = content.trim() + "\n";
      } else {
        vttContent = srtToVtt(content);
      }

      // Upload VTT file to Storage and get the public URL
      const fileUrl = await uploadToStorage(
        vttContent,
        tmdb_id,
        media_type,
        season_number || undefined,
        episode_number || undefined,
      );

      // Manual upsert: the unique index uses COALESCE(season_number,-1) so
      // standard onConflict on the raw columns won't match NULLs. We do a
      // select-then-update-or-insert to handle movies (NULL season/episode)
      // and TV episodes uniformly.
      let existingQuery = supabase
        .from("subtitles")
        .select("id")
        .eq("tmdb_id", tmdb_id)
        .eq("media_type", media_type);

      if (season_number) {
        existingQuery = existingQuery.eq("season_number", season_number);
      } else {
        existingQuery = existingQuery.is("season_number", null);
      }
      if (episode_number) {
        existingQuery = existingQuery.eq("episode_number", episode_number);
      } else {
        existingQuery = existingQuery.is("episode_number", null);
      }

      const { data: existing } = await existingQuery.maybeSingle();

      if (existing?.id) {
        const { data, error } = await supabase
          .from("subtitles")
          .update({
            title,
            content: vttContent,
            language: language || "ku",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select();
        if (error) return json({ error: error.message }, 500);
        return json({ subtitle: data[0], file_url: fileUrl }, 200);
      }

      const { data, error } = await supabase
        .from("subtitles")
        .insert({
          tmdb_id,
          media_type,
          season_number: season_number || null,
          episode_number: episode_number || null,
          title,
          language: language || "ku",
          content: vttContent,
        })
        .select();

      if (error) return json({ error: error.message }, 500);
      return json({ subtitle: data[0], file_url: fileUrl }, 201);
    }

    // PUT /subtitles/:id — admin update
    if (req.method === "PUT" && segments.length === 1) {
      const auth = req.headers.get("X-Admin-Password");
      if (!checkAdmin(auth)) return json({ error: "Unauthorized" }, 401);

      const id = segments[0];
      const body = await req.json();
      const { content, title, language } = body;

      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      let vttContent: string | null = null;
      if (content) {
        if (content.trim().toUpperCase().startsWith("WEBVTT")) {
          vttContent = content.trim() + "\n";
          updateData.content = vttContent;
        } else {
          vttContent = srtToVtt(content);
          updateData.content = vttContent;
        }
      }
      if (title) updateData.title = title;
      if (language) updateData.language = language;

      // Fetch the subtitle to get tmdb_id/season/episode for Storage re-upload
      let fileUrl: string | undefined;
      if (vttContent) {
        const { data: existing } = await supabase
          .from("subtitles")
          .select("tmdb_id, media_type, season_number, episode_number")
          .eq("id", id)
          .maybeSingle();
        if (existing) {
          fileUrl = await uploadToStorage(
            vttContent,
            existing.tmdb_id,
            existing.media_type,
            existing.season_number || undefined,
            existing.episode_number || undefined,
          );
        }
      }

      const { data, error } = await supabase
        .from("subtitles")
        .update(updateData)
        .eq("id", id)
        .select();

      if (error) return json({ error: error.message }, 500);
      return json({ subtitle: data[0], file_url: fileUrl });
    }

    // DELETE /subtitles/:id — admin delete
    if (req.method === "DELETE" && segments.length === 1) {
      const auth = req.headers.get("X-Admin-Password");
      if (!checkAdmin(auth)) return json({ error: "Unauthorized" }, 401);

      const id = segments[0];

      // Fetch the subtitle to get storage path for cleanup
      const { data: existing } = await supabase
        .from("subtitles")
        .select("tmdb_id, media_type, season_number, episode_number")
        .eq("id", id)
        .maybeSingle();

      if (existing) {
        const sPath = storagePath(
          existing.media_type,
          existing.tmdb_id,
          existing.season_number || undefined,
          existing.episode_number || undefined,
        );
        await supabase.storage.from("subtitles").remove([sPath]);
      }

      const { error } = await supabase
        .from("subtitles")
        .delete()
        .eq("id", id);

      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
