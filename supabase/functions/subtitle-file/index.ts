import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Expose-Headers": "Content-Type, Content-Length",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Extract the subtitle identifier from the path (last segment)
    const path = url.pathname.replace(/^\/(functions\/v1\/)?subtitle-file/, "").replace(/^\/subtitle-file/, "");
    const segments = path.split("/").filter(Boolean);
    const identifier = segments[0] || "";

    if (!identifier) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    // Parse identifier: "550" for movie, "550-1-1" for TV (tmdbId-season-episode)
    const parts = identifier.split("-");
    const tmdbId = parseInt(parts[0], 10);
    const season = parts.length >= 3 ? parseInt(parts[1], 10) : null;
    const episode = parts.length >= 3 ? parseInt(parts[2], 10) : null;

    if (isNaN(tmdbId)) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    // Query the subtitles table
    let query = supabase
      .from("subtitles")
      .select("content")
      .eq("tmdb_id", tmdbId);

    if (season !== null && episode !== null) {
      query = query.eq("season_number", season).eq("episode_number", episode);
    } else {
      query = query.is("season_number", null).is("episode_number", null);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return new Response("WEBVTT\n\n", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/vtt; charset=utf-8" },
      });
    }

    // Return raw VTT content
    return new Response(data.content, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    return new Response("WEBVTT\n\n", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/vtt; charset=utf-8" },
    });
  }
});
