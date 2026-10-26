/**
 * corsFetch — shared fetch helper with CORS proxy fallback.
 *
 * - Same-origin and supabase.co URLs are always fetched directly (no proxy).
 * - All other URLs: try direct first; on network/CORS failure, retry through
 *   a proxy chain in order, returning the first success.
 * - GET results are cached in memory for 10 minutes.
 */

const SUPABASE_HOST = import.meta.env.VITE_SUPABASE_URL?.replace(/^https?:\/\//, '').split('/')[0] || '';

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, { ts: number; res: Response }>();

interface CachedEntry {
  ts: number;
  body: string;
  status: number;
  statusText: string;
  headers: [string, string][];
}

const bodyCache = new Map<string, CachedEntry>();

function shouldProxy(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) return false;
    if (parsed.hostname === SUPABASE_HOST || parsed.hostname.endsWith('.supabase.co')) return false;
    return true;
  } catch {
    return false;
  }
}

function buildProxies(url: string): string[] {
  const encoded = encodeURIComponent(url);
  const proxies: string[] = [];
  const key = import.meta.env.VITE_CORSPROXY_KEY;
  if (key) {
    proxies.push(`https://corsproxy.io/?key=${key}&url=${encoded}`);
  }
  proxies.push(`https://api.allorigins.win/raw?url=${encoded}`);
  proxies.push(`https://api.codetabs.com/v1/proxy?quest=${encoded}`);
  return proxies;
}

function isCorsOrNetworkError(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('cors') ||
    msg.includes('blocked');
}

async function tryFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, { ...init, signal: init?.signal ?? controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch a URL with CORS proxy fallback.
 * For GET requests, successful responses are cached for 10 minutes.
 */
export async function corsFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const isGet = method === 'GET';

  // Check cache for GET
  if (isGet) {
    const cached = bodyCache.get(url);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: new Headers(cached.headers),
      });
    }
  }

  // Same-origin or supabase: direct only
  if (!shouldProxy(url)) {
    const res = await tryFetch(url, init);
    if (isGet && res.ok) {
      const clone = res.clone();
      try {
        const body = await clone.text();
        const headers: [string, string][] = [];
        clone.headers.forEach((v, k) => headers.push([k, v]));
        bodyCache.set(url, { ts: Date.now(), body, status: res.status, statusText: res.statusText, headers });
      } catch { /* not cacheable */ }
    }
    return res;
  }

  // External: try direct first
  try {
    const res = await tryFetch(url, init);
    if (res.ok || (res.status >= 400 && res.status < 500)) {
      // 4xx is a real response, not a CORS issue
      if (isGet && res.ok) {
        const clone = res.clone();
        try {
          const body = await clone.text();
          const headers: [string, string][] = [];
          clone.headers.forEach((v, k) => headers.push([k, v]));
          bodyCache.set(url, { ts: Date.now(), body, status: res.status, statusText: res.statusText, headers });
        } catch { /* not cacheable */ }
      }
      return res;
    }
    // 5xx — try proxies
    throw new TypeError('failed to fetch');
  } catch (err) {
    if (!isCorsOrNetworkError(err)) throw err;

    // Try proxy chain
    const proxies = buildProxies(url);
    let lastError: unknown = err;

    for (const proxyUrl of proxies) {
      try {
        // For proxy requests, strip custom headers that would cause CORS preflight issues
        const proxyInit: RequestInit = {
          method: init?.method,
          headers: init?.headers,
        };
        const res = await tryFetch(proxyUrl, proxyInit);
        if (res.ok) {
          if (isGet) {
            const clone = res.clone();
            try {
              const body = await clone.text();
              const headers: [string, string][] = [];
              clone.headers.forEach((v, k) => headers.push([k, v]));
              bodyCache.set(url, { ts: Date.now(), body, status: res.status, statusText: res.statusText, headers });
            } catch { /* not cacheable */ }
          }
          return res;
        }
        lastError = new Error(`Proxy returned ${res.status}`);
      } catch (perr) {
        lastError = perr;
      }
    }

    throw lastError;
  }
}

/**
 * Fetch JSON via corsFetch with proper error handling.
 */
export async function corsFetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await corsFetch(url, init);
  if (!res.ok) throw new Error(`corsFetch failed: ${res.status}`);
  return await res.json();
}

/**
 * Fetch text via corsFetch.
 */
export async function corsFetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await corsFetch(url, init);
  if (!res.ok) throw new Error(`corsFetch failed: ${res.status}`);
  return await res.text();
}

/**
 * Fetch a cross-origin video file (.mp4) via proxy if direct fails.
 * Forwards Range header for seeking support.
 * Returns a Response with the video body.
 */
export async function corsFetchVideo(url: string, range?: string | null): Promise<Response> {
  if (!shouldProxy(url)) {
    const headers: Record<string, string> = {};
    if (range) headers['Range'] = range;
    return await tryFetch(url, { headers });
  }

  // Try direct first
  try {
    const headers: Record<string, string> = {};
    if (range) headers['Range'] = range;
    const res = await tryFetch(url, { headers });
    if (res.ok || res.status === 206) return res;
    if (res.status >= 400 && res.status < 500) return res;
    throw new TypeError('failed to fetch');
  } catch (err) {
    if (!isCorsOrNetworkError(err)) throw err;

    // Try proxy chain with Range header
    const proxies = buildProxies(url);
    let lastError: unknown = err;

    for (const proxyUrl of proxies) {
      try {
        const headers: Record<string, string> = {};
        if (range) headers['Range'] = range;
        const res = await tryFetch(proxyUrl, { headers });
        if (res.ok || res.status === 206) return res;
        lastError = new Error(`Proxy returned ${res.status}`);
      } catch (perr) {
        lastError = perr;
      }
    }

    throw lastError;
  }
}

/**
 * Fetch a subtitle VTT file and return a Blob URL if the original is cross-origin.
 * This avoids CORS issues with <track> elements.
 */
export async function corsFetchSubtitleAsBlobUrl(url: string): Promise<string> {
  // If same-origin, return as-is (no blob needed)
  if (!shouldProxy(url)) {
    try {
      const res = await tryFetch(url);
      if (res.ok) {
        const text = await res.text();
        const blob = new Blob([text], { type: 'text/vtt' });
        return URL.createObjectURL(blob);
      }
    } catch { /* fall through to corsFetch */ }
  }

  // Cross-origin: fetch via corsFetch, create blob URL
  const text = await corsFetchText(url);
  const blob = new Blob([text], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}
