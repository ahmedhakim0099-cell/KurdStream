const VIDBOLT = 'https://vidbolt.pro';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const FH = { 'User-Agent': UA, Referer: VIDBOLT + '/', Origin: VIDBOLT };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function heightOf(q: unknown): number {
  const m = /(\d{3,4})/.exec(String(q ?? ''));
  return m ? Number(m[1]) : 0;
}
function absWith(v: string, base: string): string | null {
  try { return new URL(v, base).href; } catch { return null; }
}
async function alive(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { headers: FH, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    try { await r.body?.cancel(); } catch { /* ignore */ }
    return r.ok;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const u = new URL(req.url);
    const type = u.searchParams.get('type') ?? 'movie';
    const id = u.searchParams.get('id');
    const season = u.searchParams.get('season');
    const episode = u.searchParams.get('episode');
    if (!id) return json({ found: false, reason: 'id required' });

    const endpoint = type === 'tv'
      ? `${VIDBOLT}/api/resolve?type=tv&id=${encodeURIComponent(id)}&season=${season}&episode=${episode}`
      : `${VIDBOLT}/api/resolve?type=movie&id=${encodeURIComponent(id)}`;
    const referer = type === 'tv' ? `${VIDBOLT}/tv/${id}/${season}/${episode}` : `${VIDBOLT}/movie/${id}`;

    const res = await fetch(endpoint, {
      headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Referer: referer, Origin: VIDBOLT },
      cache: 'no-store',
    });
    if (!res.ok) return json({ found: false, reason: `upstream ${res.status}` });
    const payload = await res.json();

    const sources = (Array.isArray(payload?.stream?.sources) ? payload.stream.sources : [])
      .filter((s: any) => typeof s?.url === 'string' && s.url)
      .map((s: any, i: number) => ({ s, i, h: heightOf(s.quality) }))
      .sort((a: any, b: any) => b.h - a.h || a.i - b.i);

    if (sources.length === 0) return json({ found: false, reason: 'no sources' });

    for (const { s } of sources) {
      const streamUrl = absWith(s.url, VIDBOLT + '/');
      if (!streamUrl) continue;

      let masterText = '';
      try {
        const mres = await fetch(streamUrl, { headers: FH, cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (mres.ok) {
          const t = await mres.text();
          if (t.includes('#EXTM3U')) masterText = t;
        }
      } catch { /* dead, try next source */ }
      if (!masterText && typeof s.master === 'string' && s.master.includes('#EXTM3U')) {
        masterText = s.master as string;
      }
      if (!masterText) continue;

      const lines = masterText.split(/\r?\n/);
      const media: Array<{ idx: number; type: string; gid: string; uri: string | null }> = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith('#EXT-X-MEDIA:')) continue;
        const mtype = (/TYPE=([^,\s]+)/.exec(line)?.[1] ?? '').toUpperCase();
        const gid = /GROUP-ID="([^"]+)"/.exec(line)?.[1] ?? '';
        const uriRaw = /URI="([^"]+)"/.exec(line)?.[1] ?? null;
        media.push({ idx: i, type: mtype, gid, uri: uriRaw ? absWith(uriRaw, streamUrl) : null });
      }
      const variants: Array<{ attrIdx: number; uriIdx: number; uri: string | null }> = [];
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
        let j = i + 1;
        while (j < lines.length && (lines[j].trim() === '' || lines[j].startsWith('#'))) j++;
        const uriRaw = j < lines.length ? lines[j].trim() : '';
        const uri = uriRaw && !uriRaw.startsWith('#') ? absWith(uriRaw, streamUrl) : null;
        variants.push({ attrIdx: i, uriIdx: j, uri });
      }

      const checkUrls = [
        ...media.filter((m) => m.uri).map((m) => m.uri as string),
        ...variants.filter((v) => v.uri).map((v) => v.uri as string),
      ];
      const results = await Promise.all(checkUrls.map((x) => alive(x)));
      const okSet = new Set<string>();
      checkUrls.forEach((x, k) => { if (results[k]) okSet.add(x); });

      const liveVariants = variants.filter((v) => v.uri && okSet.has(v.uri));
      if (liveVariants.length === 0) continue;

      const liveGroups = new Set<string>();
      for (const m of media) {
        if ((m.uri ? okSet.has(m.uri) : true) && m.type && m.gid) liveGroups.add(m.type + '|' + m.gid);
      }

      const drop = new Set<number>();
      for (const m of media) {
        const keep = m.uri ? okSet.has(m.uri) : true;
        if (keep && m.uri) lines[m.idx] = lines[m.idx].replace(/URI="([^"]+)"/, () => `URI="${m.uri}"`);
        else if (!keep) drop.add(m.idx);
      }
      for (const v of variants) {
        if (!v.uri || !okSet.has(v.uri)) {
          drop.add(v.attrIdx);
          if (v.uriIdx < lines.length && !lines[v.uriIdx].trim().startsWith('#')) drop.add(v.uriIdx);
          continue;
        }
        lines[v.uriIdx] = v.uri;
        let attrs = lines[v.attrIdx];
        for (const attr of ['SUBTITLES', 'AUDIO', 'CLOSED-CAPTIONS']) {
          const m = new RegExp(`${attr}="([^"]+)"`).exec(attrs);
          if (m && !liveGroups.has(attr + '|' + m[1])) {
            attrs = attrs.replace(new RegExp(`,?${attr}="[^"]+"`, 'i'), '');
          }
        }
        lines[v.attrIdx] = attrs;
      }
      const kept = lines.filter((l, i) => !drop.has(i) && l.trim() !== '');
      const playlist = kept.some((l) => l.startsWith('#EXT-X-STREAM-INF:')) ? kept.join('\n') : null;
      if (!playlist) continue;

      const subtitles: Array<{ file: string; label: string; lang: string }> = [];
      for (const m of media) {
        if (m.type !== 'SUBTITLES' || !m.uri || !okSet.has(m.uri)) continue;
        const line = lines[m.idx];
        const lang = /LANGUAGE="([^"]+)"/.exec(line)?.[1] ?? 'en';
        const label = /NAME="([^"]+)"/.exec(line)?.[1] ?? lang;
        subtitles.push({ file: m.uri, label, lang });
      }
      for (const t of Array.isArray(payload?.stream?.subtitles) ? payload.stream.subtitles : []) {
        const file = absWith(String(t?.file ?? t?.url ?? ''), streamUrl);
        if (file && !subtitles.some((x) => x.file === file)) {
          subtitles.push({ file, label: t.label ?? t.name ?? 'Subtitle', lang: t.lang ?? 'en' });
        }
      }

      return json({ found: true, url: streamUrl, playlist, quality: s.quality ?? '', subtitles });
    }

    return json({ found: false, reason: 'no live source' });
  } catch (e) {
    return json({ found: false, reason: String(e) });
  }
});
