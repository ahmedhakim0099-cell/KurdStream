/**
 * ============================================================================
 *  VIDBOLT — the lookup
 * ============================================================================
 *  `GET /api/resolve?type=movie|tv&id=<tmdb>…` answers with a server name and a
 *  list of renditions, each carrying a URL, a kind, a quality label and
 *  sometimes an inline master playlist. One provider, several renditions: the
 *  widest one is played, and the names of the servers never leave this file —
 *  see the codename rule in `src/lib/providers/index.js`.
 *
 *  The rendition list is taken on its word. Unlike a scraped page there is
 *  nothing to parse out of it and nothing ambiguous about which URL to play, so
 *  the lookup's only job is choosing.
 * ============================================================================
 */

import { fetchWithDeadline } from '@/lib/proxy/stream';

const ENDPOINT = 'https://vidbolt.pro';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

const REQUEST_TIMEOUT_MS = 6_000;

/** The height a quality label names. `1080p`, `1080P` and `FHD` are the forms seen. */
function heightOf(quality) {
  const value = String(quality ?? '');
  const matched = /(\d{3,4})\s*[pP]/.exec(value) ?? /(\d{3,4})/.exec(value);
  return matched ? Number(matched[1]) : 0;
}

function absolute(value, baseUrl) {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

/** Subtitle renditions declared inline in a master playlist. */
function masterSubtitles(master, baseUrl) {
  const tracks = [];

  for (const [, attributes] of String(master ?? '').matchAll(/#EXT-X-MEDIA:([^\n]+)/g)) {
    if (!/TYPE=SUBTITLES/i.test(attributes)) continue;

    const uri = /URI="([^"]+)"/.exec(attributes);
    const file = uri ? absolute(uri[1], baseUrl) : null;
    if (!file) continue;

    const lang = /LANGUAGE="([^"]+)"/.exec(attributes)?.[1] ?? 'en';
    const name = /NAME="([^"]+)"/.exec(attributes)?.[1] ?? lang;
    tracks.push({ file, label: name, lang });
  }

  return tracks;
}

/** The subtitle list the answer carries beside the renditions, when it does. */
function listedSubtitles(stream, baseUrl) {
  if (!Array.isArray(stream?.subtitles)) return [];

  const tracks = [];
  for (const track of stream.subtitles) {
    const file = absolute(track?.file ?? track?.url, baseUrl);
    if (!file) continue;
    tracks.push({
      file,
      label: track.label ?? track.name ?? track.lang ?? track.language ?? 'Subtitle',
      lang: track.lang ?? track.language ?? 'en',
    });
  }
  return tracks;
}

function dedupe(tracks) {
  const seen = new Set();
  return tracks.filter((track) => {
    if (seen.has(track.file)) return false;
    seen.add(track.file);
    return true;
  });
}

/**
 * The best rendition for this title, or null when it has none.
 *
 * @returns {Promise<{url: string, type: string, headers: object, subtitles: Array}|null>}
 */
export async function inspectVidbolt({ mediaType, tmdbId, season, episode, signal }) {
  const referer =
    mediaType === 'tv'
      ? `${ENDPOINT}/tv/${tmdbId}/${season}/${episode}`
      : `${ENDPOINT}/movie/${tmdbId}`;

  const endpoint =
    mediaType === 'tv'
      ? `${ENDPOINT}/api/resolve?type=tv&id=${encodeURIComponent(tmdbId)}&season=${season}&episode=${episode}`
      : `${ENDPOINT}/api/resolve?type=movie&id=${encodeURIComponent(tmdbId)}`;

  let payload;
  try {
    const response = await fetchWithDeadline(
      endpoint,
      {
        headers: { ...HEADERS, Referer: referer, Origin: ENDPOINT },
        cache: 'no-store',
        signal,
      },
      REQUEST_TIMEOUT_MS,
    );

    if (!response.ok) return null;
    payload = await response.json();
  } catch {
    return null;
  }

  const stream = payload?.stream;
  const sources = Array.isArray(stream?.sources)
    ? stream.sources.filter((source) => typeof source?.url === 'string' && source.url)
    : [];

  if (!sources.length) return null;

  // Widest first; between equal renditions an English one is preferred, and
  // otherwise the order the service gave is kept.
  const best = sources
    .map((source, index) => ({
      source,
      index,
      height: heightOf(source.quality),
      english: /english/i.test(source.language ?? ''),
    }))
    .sort(
      (left, right) =>
        right.height - left.height ||
        Number(right.english) - Number(left.english) ||
        left.index - right.index,
    )[0].source;

  const url = absolute(best.url, `${ENDPOINT}/`);
  if (!url) return null;

  return {
    url,
    type: /mp4/i.test(best.kind ?? '') ? 'video/mp4' : 'application/x-mpegURL',
    headers: { referer, origin: ENDPOINT },
    subtitles: dedupe([
      ...listedSubtitles(stream, url),
      ...masterSubtitles(best.master, url),
    ]),
  };
}
