import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeout = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function tryFetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA, "Accept": "text/html,*/*" } });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function extractM3u8(html: string): string[] {
  if (!html) return [];
  const matches = html.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/g);
  return matches ? [...new Set(matches)] : [];
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const params = url.searchParams;
    const id = params.get("id");
    const type = params.get("type") || "movie";
    const season = params.get("season") || "1";
    const episode = params.get("episode") || "1";

    if (!id) return json({ error: "Missing id", sources: [] }, 400);

    const isTv = type === "tv";
    const sources: Array<{ url: string; quality: string; provider: string }> = [];
    const seen = new Set<string>();

    function addSource(u: string, provider: string, quality = "auto") {
      if (!u || seen.has(u)) return;
      seen.add(u);
      sources.push({ url: u, quality, provider });
    }

    // ── 0. Check database for admin-pasted direct URLs ──
    try {
      let query = supabase
        .from("video_urls")
        .select("url, label")
        .eq("tmdb_id", parseInt(id))
        .eq("media_type", type);

      if (isTv) {
        query = query.eq("season_number", parseInt(season)).eq("episode_number", parseInt(episode));
      } else {
        query = query.is("season_number", null).is("episode_number", null);
      }

      const { data: dbUrls } = await query;
      if (dbUrls && dbUrls.length > 0) {
        for (const row of dbUrls) {
          if (row.url) addSource(row.url, "دڵخواز", row.label || "auto");
        }
        // If admin has set URLs, return them exclusively
        return json({ sources });
      }
    } catch {}

    // ── Fallback: scrape third-party providers ──

    // 1. vidsrc.cc/v2 API (JSON)
    try {
      const apiUrl = isTv
        ? `https://vidsrc.cc/v2/api/tv/${id}/${season}/${episode}`
        : `https://vidsrc.cc/v2/api/movie/${id}`;
      const res = await fetchWithTimeout(apiUrl, { headers: { "User-Agent": UA, "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json();
        if (data?.sources && Array.isArray(data.sources)) {
          for (const src of data.sources) {
            if (src.url && (src.url.includes(".m3u8") || src.url.includes(".mp4"))) {
              addSource(src.url, "vidsrc.cc", src.quality || "auto");
            }
          }
        }
      }
    } catch {}

    // 2. vidsrc.xyz embed scrape
    {
      const embedUrl = isTv
        ? `https://vidsrc.xyz/embed/tv/${id}/${season}/${episode}`
        : `https://vidsrc.xyz/embed/movie/${id}`;
      const html = await tryFetchHtml(embedUrl);
      if (html) for (const m of extractM3u8(html).slice(0, 3)) addSource(m, "vidsrc.xyz");
    }

    // 3. 2embed.cc embed scrape
    {
      const embedUrl = isTv
        ? `https://www.2embed.cc/embedtv/${id}&s=${season}&e=${episode}`
        : `https://www.2embed.cc/embed/${id}`;
      const html = await tryFetchHtml(embedUrl);
      if (html) for (const m of extractM3u8(html).slice(0, 3)) addSource(m, "2embed");
    }

    // 4. vidsrc.net embed scrape
    {
      const embedUrl = isTv
        ? `https://vidsrc.net/embed/tv/${id}/${season}/${episode}`
        : `https://vidsrc.net/embed/movie/${id}`;
      const html = await tryFetchHtml(embedUrl);
      if (html) for (const m of extractM3u8(html).slice(0, 3)) addSource(m, "vidsrc.net");
    }

    // 5. multiembed scrape
    {
      const embedUrl = isTv
        ? `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1&s=${season}&e=${episode}`
        : `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1`;
      const html = await tryFetchHtml(embedUrl);
      if (html) for (const m of extractM3u8(html).slice(0, 3)) addSource(m, "multiembed");
    }

    // 6. embed.su scrape
    {
      const embedUrl = isTv
        ? `https://embed.su/embed/tv/${id}/${season}/${episode}`
        : `https://embed.su/embed/movie/${id}`;
      const html = await tryFetchHtml(embedUrl);
      if (html) for (const m of extractM3u8(html).slice(0, 3)) addSource(m, "embed.su");
    }

    return json({ sources });
  } catch (err) {
    return json({ error: (err as Error).message, sources: [] }, 500);
  }
});
