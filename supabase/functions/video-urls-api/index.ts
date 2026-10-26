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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function checkAdmin(auth: string | null): boolean {
  return auth === ADMIN_PASSWORD;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/(functions\/v1\/)?video-urls-api/, "").replace(/^\/video-urls-api/, "");
    const segments = path.split("/").filter(Boolean);

    // GET /video-urls — admin list all
    if (req.method === "GET" && segments.length === 0) {
      const auth = req.headers.get("X-Admin-Password");
      if (!checkAdmin(auth)) return json({ error: "Unauthorized" }, 401);

      const { data, error } = await supabase
        .from("video_urls")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) return json({ error: error.message }, 500);
      return json({ urls: data });
    }

    // GET /video-urls/:tmdbId — public, fetch URLs for a movie or episode
    if (req.method === "GET" && segments.length === 1 && /^\d+$/.test(segments[0])) {
      const tmdbId = parseInt(segments[0]);
      const type = url.searchParams.get("type") || "movie";
      const season = url.searchParams.get("season");
      const episode = url.searchParams.get("episode");

      let query = supabase
        .from("video_urls")
        .select("url, label")
        .eq("tmdb_id", tmdbId)
        .eq("media_type", type);

      if (season) query = query.eq("season_number", parseInt(season));
      else query = query.is("season_number", null);
      if (episode) query = query.eq("episode_number", parseInt(episode));
      else query = query.is("episode_number", null);

      const { data, error } = await query;
      if (error) return json({ error: error.message }, 500);
      return json({ urls: data || [] });
    }

    // POST /video-urls — admin upsert (atomic, never deletes existing rows)
    if (req.method === "POST" && segments.length === 0) {
      const auth = req.headers.get("X-Admin-Password");
      if (!checkAdmin(auth)) return json({ error: "Unauthorized" }, 401);

      const body = await req.json();
      const { tmdb_id, media_type, season_number, episode_number, url: videoUrl, label } = body;

      if (!tmdb_id || !media_type || !videoUrl) {
        return json({ error: "Missing required fields: tmdb_id, media_type, url" }, 400);
      }

      // Atomic upsert: find existing by unique key, update in place; otherwise insert.
      // Never deletes or touches other rows — editing one movie's URL preserves all others.
      let findQuery = supabase
        .from("video_urls")
        .select("id")
        .eq("tmdb_id", tmdb_id)
        .eq("media_type", media_type);
      if (season_number) {
        findQuery = findQuery.eq("season_number", season_number);
      } else {
        findQuery = findQuery.is("season_number", null);
      }
      if (episode_number) {
        findQuery = findQuery.eq("episode_number", episode_number);
      } else {
        findQuery = findQuery.is("episode_number", null);
      }

      const { data: existing } = await findQuery.maybeSingle();

      if (existing?.id) {
        const { data, error } = await supabase
          .from("video_urls")
          .update({
            url: videoUrl,
            label: label || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select();
        if (error) return json({ error: error.message }, 500);
        return json({ url: data[0] }, 200);
      }

      const { data, error } = await supabase
        .from("video_urls")
        .insert({
          tmdb_id,
          media_type,
          season_number: season_number || null,
          episode_number: episode_number || null,
          url: videoUrl,
          label: label || null,
        })
        .select();
      if (error) return json({ error: error.message }, 500);
      return json({ url: data[0] }, 201);
    }

    // DELETE /video-urls/:id — admin delete
    if (req.method === "DELETE" && segments.length === 1) {
      const auth = req.headers.get("X-Admin-Password");
      if (!checkAdmin(auth)) return json({ error: "Unauthorized" }, 401);

      const id = segments[0];
      const { error } = await supabase
        .from("video_urls")
        .delete()
        .eq("id", id);

      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
