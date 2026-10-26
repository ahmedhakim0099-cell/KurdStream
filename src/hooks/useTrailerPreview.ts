import { useState, useEffect, useRef, useCallback } from 'react';
import { corsFetchJson } from '@/lib/corsFetch';

const API_KEY = '7d14dee38d0eb74c7fd96bec8dceefd5';
const BASE_URL = 'https://api.themoviedb.org/3';
const YT_EMBED = 'https://www.youtube.com/embed';

interface TrailerInfo {
  key: string;
  site: string;
}

const trailerCache = new Map<string, TrailerInfo | null>();

async function fetchTrailer(item: { id: number; media_type?: string; title?: string }): Promise<TrailerInfo | null> {
  const cacheKey = `${item.id}-${item.media_type || 'movie'}`;
  if (trailerCache.has(cacheKey)) return trailerCache.get(cacheKey) || null;

  const isTv = item.media_type === 'tv' || !item.title;
  try {
    const endpoint = isTv ? `tv/${item.id}/videos` : `movie/${item.id}/videos`;
    const data = await corsFetchJson(`${BASE_URL}/${endpoint}?api_key=${API_KEY}&language=en-US`);
    const videos = data.results || [];
    // Prefer official trailers, then teasers, then any video
    const trailer =
      videos.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube' && v.official) ||
      videos.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube') ||
      videos.find((v: any) => v.type === 'Teaser' && v.site === 'YouTube') ||
      videos.find((v: any) => v.site === 'YouTube');
    const result = trailer ? { key: trailer.key, site: trailer.site } : null;
    trailerCache.set(cacheKey, result);
    return result;
  } catch {
    trailerCache.set(cacheKey, null);
    return null;
  }
}

export function useTrailerPreview(item: { id: number; media_type?: string; title?: string }) {
  const [trailer, setTrailer] = useState<TrailerInfo | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [shouldPlay, setShouldPlay] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchPromise = useRef<Promise<TrailerInfo | null> | null>(null);

  const onHoverStart = useCallback(() => {
    setIsHovering(true);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      setShouldPlay(true);
    }, 1000);
  }, []);

  const onHoverEnd = useCallback(() => {
    setIsHovering(false);
    setShouldPlay(false);
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isHovering || trailer || fetchPromise.current) return;
    fetchPromise.current = fetchTrailer(item);
    fetchPromise.current.then((t) => {
      setTrailer(t);
      fetchPromise.current = null;
    });
  }, [isHovering, item, trailer]);

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  const trailerUrl = shouldPlay && trailer
    ? `${YT_EMBED}/${trailer.key}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailer.key}&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3`
    : null;

  return { trailer, isHovering, shouldPlay, onHoverStart, onHoverEnd, trailerUrl };
}
