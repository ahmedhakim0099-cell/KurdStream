import { createClient } from '@supabase/supabase-js';
import type { Subtitle } from '@/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const API_BASE = `${SUPABASE_URL}/functions/v1/subtitles-api`;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
});

export function getSubtitleFileUrl(tmdbId: number, season?: number, episode?: number): string {
  const identifier = season && episode ? `${tmdbId}-${season}-${episode}` : `${tmdbId}`;
  return `${SUPABASE_URL}/functions/v1/subtitle-file/${identifier}`;
}

/**
 * Build the Storage file path for a subtitle VTT file.
 * Movies: movie-{tmdbId}.vtt
 * TV: tv-{tmdbId}-s{season}e{episode}.vtt
 */
export function subtitleStoragePath(mediaType: string, tmdbId: number, season?: number, episode?: number): string {
  return mediaType === 'tv'
    ? `tv-${tmdbId}-s${season}e${episode}.vtt`
    : `movie-${tmdbId}.vtt`;
}

/**
 * Upload a VTT subtitle file to the `subtitles` bucket in Supabase Storage.
 * Ensures the bucket exists (creates it if missing).
 * Returns the public URL from getPublicUrl().
 */
export async function uploadSubtitleToStorage(
  vttContent: string,
  tmdbId: number,
  mediaType: string,
  season?: number,
  episode?: number,
): Promise<string> {
  const path = subtitleStoragePath(mediaType, tmdbId, season, episode);
  const vttBlob = new Blob([vttContent], { type: 'text/vtt' });

  const { error: upErr } = await supabase.storage
    .from('subtitles')
    .upload(path, vttBlob, { contentType: 'text/vtt', upsert: true });
  if (upErr) {
    alert('هەڵە لە بارکردنی فایل: ' + upErr.message + ' — دڵنیابە باکێتی subtitles لە Supabase دروستکراوە و Public ە');
    throw upErr;
  }

  const { data } = supabase.storage.from('subtitles').getPublicUrl(path);
  return data.publicUrl;
}

export async function fetchSubtitles(tmdbId: number, season?: number, episode?: number): Promise<Subtitle[]> {
  const params = new URLSearchParams();
  if (season) params.set('season', String(season));
  if (episode) params.set('episode', String(episode));

  const url = `${API_BASE}/${tmdbId}${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Failed to fetch subtitles: ${res.status}`);
  const data = await res.json();
  return data.subtitles || [];
}

export async function fetchAllSubtitles(adminPassword: string): Promise<Subtitle[]> {
  const res = await fetch(API_BASE, {
    headers: { ...headers(), 'X-Admin-Password': adminPassword },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('وشەی نهێنی هەڵەیە');
    const body = await res.text().catch(() => '');
    throw new Error(`هەڵە لە بارکردنی ژێرنووسەکان (${res.status}) ${body}`);
  }
  const data = await res.json();
  return data.subtitles || [];
}

export async function uploadSubtitle(
  adminPassword: string,
  payload: {
    tmdb_id: number;
    media_type: string;
    season_number?: number;
    episode_number?: number;
    title: string;
    content: string;
    language?: string;
  }
): Promise<Subtitle> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { ...headers(), 'X-Admin-Password': adminPassword },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to upload subtitle');
  }
  const data = await res.json();
  return data.subtitle;
}

export async function updateSubtitle(
  adminPassword: string,
  id: string,
  payload: { content?: string; title?: string; language?: string }
): Promise<Subtitle> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { ...headers(), 'X-Admin-Password': adminPassword },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update subtitle');
  }
  const data = await res.json();
  return data.subtitle;
}

export async function deleteSubtitle(adminPassword: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'DELETE',
    headers: { ...headers(), 'X-Admin-Password': adminPassword },
  });
  if (!res.ok) throw new Error('Failed to delete subtitle');
}

const memoryCache = new Map<string, string>();
const LS_KEY = 'ks_translations';

function loadLSCache(): Map<string, string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, string>;
    return new Map(Object.entries(obj));
  } catch { return new Map(); }
}

function saveLSCache(cache: Map<string, string>): void {
  try {
    const obj: Record<string, string> = {};
    let count = 0;
    for (const [k, v] of cache) {
      obj[k] = v;
      if (++count >= 500) break;
    }
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
  } catch { /* quota exceeded */ }
}

const lsCache = loadLSCache();

export async function translateSynopsis(text: string): Promise<string> {
  if (!text || text.trim().length < 2) return text;

  const cacheKey = text.trim().slice(0, 200);
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey)!;
  if (lsCache.has(cacheKey)) { memoryCache.set(cacheKey, lsCache.get(cacheKey)!); return lsCache.get(cacheKey)!; }

  // Try the Supabase edge function (OpenAI-based) first
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/translate-synopsis`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ text, target_lang: 'ku' }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.translated_text && data.translated_text.trim().length > 0) {
        memoryCache.set(cacheKey, data.translated_text);
        lsCache.set(cacheKey, data.translated_text);
        saveLSCache(lsCache);
        return data.translated_text;
      }
    }
  } catch { /* fall through to Google Translate fallback */ }

  // Fallback: Google Translate free endpoint (supports ckb — Central Kurdish/Sorani)
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ckb&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0]
          .map((seg: unknown[]) => (Array.isArray(seg) ? seg[0] : ''))
          .filter(Boolean)
          .join('');
        if (translated && translated.trim().length > 0) {
          memoryCache.set(cacheKey, translated);
          lsCache.set(cacheKey, translated);
          saveLSCache(lsCache);
          return translated;
        }
      }
    }
  } catch { /* give up, return original */ }

  return text;
}

export interface StreamSource {
  url: string;
  quality: string;
  provider: string;
}

export interface VideoUrl {
  id: string;
  tmdb_id: number;
  media_type: string;
  season_number: number | null;
  episode_number: number | null;
  url: string;
  label: string | null;
  updated_at: string;
}

/** Public lookup — fetch the custom video URL for a specific movie/episode (no admin password needed). */
export async function fetchCustomVideoUrl(
  tmdbId: number,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number
): Promise<string | null> {
  const params = new URLSearchParams({ type });
  if (season) params.set('season', String(season));
  if (episode) params.set('episode', String(episode));
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/video-urls-api/${tmdbId}?${params}`, {
      headers: headers(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const urls = data.urls as { url: string }[] | undefined;
    return urls && urls.length > 0 ? urls[0].url : null;
  } catch {
    return null;
  }
}

export async function fetchVideoUrls(adminPassword: string): Promise<VideoUrl[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/video-urls-api`, {
    headers: { ...headers(), 'X-Admin-Password': adminPassword },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('وشەی نهێنی هەڵەیە');
    throw new Error(`هەڵە لە بارکردنی URLەکان (${res.status})`);
  }
  const data = await res.json();
  return data.urls || [];
}

export async function upsertVideoUrl(
  adminPassword: string,
  payload: {
    tmdb_id: number;
    media_type: string;
    season_number?: number;
    episode_number?: number;
    url: string;
    label?: string;
  }
): Promise<VideoUrl> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/video-urls-api`, {
    method: 'POST',
    headers: { ...headers(), 'X-Admin-Password': adminPassword },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save video URL');
  }
  const data = await res.json();
  return data.url;
}

export async function deleteVideoUrl(adminPassword: string, id: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/video-urls-api/${id}`, {
    method: 'DELETE',
    headers: { ...headers(), 'X-Admin-Password': adminPassword },
  });
  if (!res.ok) throw new Error('Failed to delete video URL');
}

export async function fetchStreamSources(
  tmdbId: number,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number
): Promise<StreamSource[]> {
  const params = new URLSearchParams({ id: String(tmdbId), type });
  if (season) params.set('season', String(season));
  if (episode) params.set('episode', String(episode));

  const res = await fetch(`${SUPABASE_URL}/functions/v1/stream-api?${params}`, {
    headers: headers(),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.sources || [];
}


