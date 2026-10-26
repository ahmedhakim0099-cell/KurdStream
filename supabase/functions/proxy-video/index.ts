/*
  Video proxy edge function — bypasses CORS & hotlink blocking on external video servers.

  GET /proxy-video?url=<target_url>
    - .m3u8: fetches playlist, rewrites all segment/key URLs to also go through this proxy, returns rewritten text
    - .mp4 / .ts / other: streams the response body through, forwarding Range headers for seeking
    - All responses include open CORS headers
    - Spoofs Referer + User-Agent to look like a browser visit to the target's own origin
*/

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range, Authorization, X-Client-Info, Apikey",
  "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges, Content-Type",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const reqUrl = new URL(req.url);
    const targetParam = reqUrl.searchParams.get("url");

    if (!targetParam) {
      return json({ error: "Missing url parameter" }, 400);
    }

    let targetUrl: string;
    try {
      targetUrl = decodeURIComponent(targetParam);
    } catch {
      targetUrl = targetParam;
    }

    // Validate it's a proper URL
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return json({ error: "Invalid url" }, 400);
    }

    if (!parsed.protocol.startsWith("http")) {
      return json({ error: "Only http(s) URLs allowed" }, 400);
    }

    const targetOrigin = parsed.origin;

    // Build spoofed headers — mimic a real browser visit to bypass hotlink protection,
    // bot detection, and referer checks on private file hostings.
    const upstreamHeaders: Record<string, string> = {
      "User-Agent": UA,
      "Referer": targetOrigin + "/",
      "Origin": targetOrigin,
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "identity",
      "Sec-Fetch-Dest": "video",
      "Sec-Fetch-Mode": "no-cors",
      "Sec-Fetch-Site": "cross-site",
      "Sec-Fetch-User": "?0",
      "Connection": "keep-alive",
    };

    // Forward Range header for seeking support on .mp4
    const range = req.headers.get("Range");
    if (range) upstreamHeaders["Range"] = range;

    // Determine content type hint from URL
    const lowerTarget = targetUrl.toLowerCase();
    const isM3u8 =
      lowerTarget.includes(".m3u8") ||
      lowerTarget.includes(".m3u") ||
      parsed.pathname.endsWith(".m3u8") ||
      parsed.pathname.endsWith(".m3u");

    // ── HLS playlist: rewrite URLs ──
    if (isM3u8) {
      const proxyBase = `${reqUrl.origin}/functions/v1/proxy-video`;

      const upstream = await fetch(targetUrl, {
        headers: upstreamHeaders,
        redirect: "follow",
      });

      if (!upstream.ok) {
        return json({ error: `Upstream returned ${upstream.status}` }, upstream.status);
      }

      const text = await upstream.text();
      const rewritten = rewriteM3u8(text, targetUrl, proxyBase);

      return new Response(rewritten, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-cache",
        },
      });
    }

    // ── Binary media (.mp4, .ts, .key, etc.): stream through ──
    // Some hosts reject HEAD but allow GET; always use GET and let the player
    // handle Range via the forwarded header above.
    const upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
      redirect: "follow",
    });

    // Treat 403/429 as upstream errors so the player shows a clear message
    if (!upstream.ok && upstream.status !== 206) {
      return json({ error: `Upstream returned ${upstream.status}` }, upstream.status);
    }

    // Pass through content-type, content-length, content-range, accept-ranges
    const respHeaders: Record<string, string> = { ...corsHeaders };
    const ct = upstream.headers.get("Content-Type");
    if (ct) respHeaders["Content-Type"] = ct;
    const cl = upstream.headers.get("Content-Length");
    if (cl) respHeaders["Content-Length"] = cl;
    const cr = upstream.headers.get("Content-Range");
    if (cr) respHeaders["Content-Range"] = cr;
    const ar = upstream.headers.get("Accept-Ranges");
    if (ar) respHeaders["Accept-Ranges"] = ar;
    respHeaders["Cache-Control"] = "public, max-age=3600";

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Rewrite all URLs inside an HLS playlist so segment/key/sub-playlist requests
 * also go through our proxy. Handles both relative and absolute URLs.
 */
function rewriteM3u8(content: string, baseUrl: string, proxyBase: string): string {
  const lines = content.split("\n");
  return lines
    .map((line) => {
      const trimmed = line.trim();

      // Empty line — keep as-is
      if (!trimmed) return line;

      // Comment / directive line — may contain URI="..." attributes
      if (trimmed.startsWith("#")) {
        if (trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
            const absolute = new URL(uri, baseUrl).href;
            return `URI="${proxyBase}?url=${encodeURIComponent(absolute)}"`;
          });
        }
        return line;
      }

      // URL line — rewrite to go through proxy
      try {
        const absolute = new URL(trimmed, baseUrl).href;
        return `${proxyBase}?url=${encodeURIComponent(absolute)}`;
      } catch {
        // Not a valid URL — keep as-is
        return line;
      }
    })
    .join("\n");
}
