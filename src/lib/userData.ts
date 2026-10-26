import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { MediaItem } from '@/types';
import { corsFetchJson } from '@/lib/corsFetch';

const TMDB_API_KEY = '7d14dee38d0eb74c7fd96bec8dceefd5';
const TMDB_BASE = 'https://api.themoviedb.org/3';

async function fetchRuntime(item: MediaItem): Promise<number> {
  try {
    const isTv = item.name ? true : false;
    const url = isTv
      ? `${TMDB_BASE}/tv/${item.id}?api_key=${TMDB_API_KEY}`
      : `${TMDB_BASE}/movie/${item.id}?api_key=${TMDB_API_KEY}`;
    const data = await corsFetchJson(url);
    if (isTv) {
      const epRunTimes = data.episode_run_time as number[] | undefined;
      if (epRunTimes && epRunTimes.length > 0) return epRunTimes[0];
      return data.runtime || 0;
    }
    return data.runtime || 0;
  } catch { return 0; }
}

export interface UserListItem {
  id: string;
  user_id?: string;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  list_type: 'watched' | 'favorites' | 'watch_later';
  title: string;
  poster_path: string;
  runtime?: number;
}

export interface WatchProgressItem {
  id: string;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  season_number: number | null;
  episode_number: number | null;
  resume_position: number;
  duration: number;
  title: string;
  poster_path: string;
  backdrop_path: string | null;
}

export interface EpisodeProgressItem {
  tmdb_id: number;
  season_number: number;
  episode_number: number;
  watched: boolean;
}

// ── User Lists (watched / favorites / watch_later) ──

export function useUserLists(userId: string | null) {
  const [lists, setLists] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isLocal = userId?.startsWith('local-');

  const refresh = useCallback(async () => {
    if (!userId) { setLists([]); setLoading(false); return; }
    if (isLocal) {
      try {
        const raw = localStorage.getItem(`kurdstream_lists_${userId}`);
        setLists(raw ? JSON.parse(raw) : []);
      } catch { setLists([]); }
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('user_lists')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) console.error('Error loading lists:', error);
    setLists((data || []) as unknown as UserListItem[]);
    setLoading(false);
  }, [userId, isLocal]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggleList = useCallback(async (item: MediaItem, listType: 'watched' | 'favorites' | 'watch_later') => {
    if (!userId) return;
    const mediaType = item.name ? 'tv' : 'movie';
    let runtime = 0;
    if (listType === 'watched') {
      runtime = await fetchRuntime(item);
    }
    if (isLocal) {
      setLists(prev => {
        const existing = prev.find(
          l => l.tmdb_id === item.id && l.media_type === mediaType && l.list_type === listType
        );
        let next: UserListItem[];
        if (existing) {
          next = prev.filter(l => l.id !== existing.id);
        } else {
          next = [...prev, {
            id: 'local-' + Math.random().toString(36).slice(2),
            user_id: userId,
            tmdb_id: item.id,
            media_type: mediaType as 'movie' | 'tv',
            list_type: listType,
            title: item.title || item.name || '',
            poster_path: item.poster_path || '',
            runtime,
          }];
        }
        localStorage.setItem(`kurdstream_lists_${userId}`, JSON.stringify(next));
        return next;
      });
      return;
    }
    const existing = lists.find(
      l => l.tmdb_id === item.id && l.media_type === mediaType && l.list_type === listType
    );
    // Optimistic update: immediately reflect in local state
    setLists(prev => {
      if (existing) {
        return prev.filter(l => l.id !== existing.id);
      }
      return [...prev, {
        id: 'temp-' + Math.random().toString(36).slice(2),
        user_id: userId,
        tmdb_id: item.id,
        media_type: mediaType as 'movie' | 'tv',
        list_type: listType,
        title: item.title || item.name || '',
        poster_path: item.poster_path || '',
        runtime,
      }];
    });
    if (existing) {
      await supabase.from('user_lists').delete().eq('id', existing.id);
    } else {
      await supabase.from('user_lists').insert({
        user_id: userId,
        tmdb_id: item.id,
        media_type: mediaType,
        list_type: listType,
        title: item.title || item.name || '',
        poster_path: item.poster_path || '',
        runtime,
      });
    }
    refresh();
  }, [userId, isLocal, lists, refresh]);

  const isInList = useCallback((itemId: number, listType: 'watched' | 'favorites' | 'watch_later') => {
    return lists.some(l => l.tmdb_id === itemId && l.list_type === listType);
  }, [lists]);

  const getList = useCallback((listType: 'watched' | 'favorites' | 'watch_later') => {
    return lists.filter(l => l.list_type === listType);
  }, [lists]);

  return { lists, loading, toggleList, isInList, getList, refresh };
}

// ── Episode Progress (with smart auto-backfill) ──

export function useEpisodeProgress(userId: string | null, tmdbId: number | null) {
  const [episodes, setEpisodes] = useState<EpisodeProgressItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isLocal = userId?.startsWith('local-');
  const lsKey = userId && tmdbId ? `kurdstream_epprogress_${userId}_${tmdbId}` : '';

  const refresh = useCallback(async () => {
    if (!userId || !tmdbId) { setEpisodes([]); setLoading(false); return; }
    if (isLocal) {
      try {
        const raw = localStorage.getItem(lsKey);
        setEpisodes(raw ? JSON.parse(raw) : []);
      } catch { setEpisodes([]); }
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('episode_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('tmdb_id', tmdbId);
    if (error) console.error('Error loading episode progress:', error);
    setEpisodes((data || []).map((e: any) => ({
      tmdb_id: e.tmdb_id,
      season_number: e.season_number,
      episode_number: e.episode_number,
      watched: e.watched,
    })));
    setLoading(false);
  }, [userId, tmdbId, isLocal, lsKey]);

  useEffect(() => { refresh(); }, [refresh]);

  const isEpisodeWatched = useCallback((season: number, episode: number) => {
    return episodes.some(e => e.season_number === season && e.episode_number === episode && e.watched);
  }, [episodes]);

  const markEpisodeWatched = useCallback(async (season: number, episode: number, totalEpisodesInSeason?: number) => {
    if (!userId || !tmdbId) return;
    const maxEp = totalEpisodesInSeason || episode;

    const existingMap = new Map<string, boolean>();
    episodes.forEach(e => {
      if (e.season_number === season) {
        existingMap.set(`${e.episode_number}`, e.watched);
      }
    });

    const newEps: EpisodeProgressItem[] = [];
    for (let ep = 1; ep <= Math.min(episode, maxEp); ep++) {
      if (!existingMap.get(`${ep}`)) {
        newEps.push({ tmdb_id: tmdbId, season_number: season, episode_number: ep, watched: true });
      }
    }
    newEps.push({ tmdb_id: tmdbId, season_number: season, episode_number: episode, watched: true });

    if (isLocal) {
      setEpisodes(prev => {
        const merged = [...prev];
        for (const ne of newEps) {
          const idx = merged.findIndex(e => e.season_number === ne.season_number && e.episode_number === ne.episode_number);
          if (idx >= 0) merged[idx] = ne;
          else merged.push(ne);
        }
        localStorage.setItem(lsKey, JSON.stringify(merged));
        return merged;
      });
      return;
    }

    const upserts: any[] = newEps.map(ne => ({
      user_id: userId,
      tmdb_id: tmdbId,
      season_number: ne.season_number,
      episode_number: ne.episode_number,
      watched: true,
    }));
    const { error } = await supabase
      .from('episode_progress')
      .upsert(upserts, { onConflict: 'user_id,tmdb_id,season_number,episode_number' });
    if (error) console.error('Error marking episodes:', error);
    refresh();
  }, [userId, tmdbId, isLocal, lsKey, episodes, refresh]);

  const toggleEpisodeWatched = useCallback(async (season: number, episode: number) => {
    if (!userId || !tmdbId) return;
    const current = episodes.find(e => e.season_number === season && e.episode_number === episode);
    const newWatched = current ? !current.watched : true;

    // Optimistic update for immediate UI feedback
    setEpisodes(prev => {
      const idx = prev.findIndex(e => e.season_number === season && e.episode_number === episode);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], watched: newWatched };
        return next;
      }
      return [...prev, { tmdb_id: tmdbId, season_number: season, episode_number: episode, watched: newWatched }];
    });

    if (newWatched) {
      if (isLocal) {
        setEpisodes(prev => {
          const merged = [...prev];
          const idx = merged.findIndex(e => e.season_number === season && e.episode_number === episode);
          if (idx >= 0) merged[idx] = { ...merged[idx], watched: true };
          else merged.push({ tmdb_id: tmdbId, season_number: season, episode_number: episode, watched: true });
          localStorage.setItem(lsKey, JSON.stringify(merged));
          return merged;
        });
        return;
      }
      await supabase
        .from('episode_progress')
        .upsert({
          user_id: userId,
          tmdb_id: tmdbId,
          season_number: season,
          episode_number: episode,
          watched: true,
        }, { onConflict: 'user_id,tmdb_id,season_number,episode_number' });
    } else {
      if (isLocal) {
        setEpisodes(prev => {
          const next = prev.map(e =>
            e.season_number === season && e.episode_number === episode
              ? { ...e, watched: false }
              : e
          );
          localStorage.setItem(lsKey, JSON.stringify(next));
          return next;
        });
        return;
      }
      await supabase
        .from('episode_progress')
        .upsert({
          user_id: userId,
          tmdb_id: tmdbId,
          season_number: season,
          episode_number: episode,
          watched: false,
        }, { onConflict: 'user_id,tmdb_id,season_number,episode_number' });
    }
  }, [userId, tmdbId, isLocal, lsKey, episodes]);

  return { episodes, loading, isEpisodeWatched, markEpisodeWatched, toggleEpisodeWatched, refresh };
}

// ── Watch Progress (resume playback + stats) ──

export function useWatchProgress(userId: string | null) {
  const [progress, setProgress] = useState<WatchProgressItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isLocal = userId?.startsWith('local-');
  const lsKey = userId ? `kurdstream_watchprogress_${userId}` : '';

  const refresh = useCallback(async () => {
    if (!userId) { setProgress([]); setLoading(false); return; }
    if (isLocal) {
      try {
        const raw = localStorage.getItem(lsKey);
        setProgress(raw ? JSON.parse(raw) : []);
      } catch { setProgress([]); }
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('watch_progress')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) console.error('Error loading watch progress:', error);
    setProgress((data || []) as unknown as WatchProgressItem[]);
    setLoading(false);
  }, [userId, isLocal, lsKey]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveProgress = useCallback(async (
    item: MediaItem,
    currentTime: number,
    duration: number,
    seasonNumber?: number,
    episodeNumber?: number,
  ) => {
    if (!userId || duration === 0) return;
    const mediaType = item.name ? 'tv' : 'movie';
    const entry: WatchProgressItem = {
      id: `${item.id}_${mediaType}_${seasonNumber || 0}_${episodeNumber || 0}`,
      tmdb_id: item.id,
      media_type: mediaType as 'movie' | 'tv',
      season_number: seasonNumber || null,
      episode_number: episodeNumber || null,
      resume_position: currentTime,
      duration,
      title: item.title || item.name || '',
      poster_path: item.poster_path || '',
      backdrop_path: item.backdrop_path || null,
    };

    if (isLocal) {
      setProgress(prev => {
        const idx = prev.findIndex(p =>
          p.tmdb_id === entry.tmdb_id && p.media_type === entry.media_type &&
          p.season_number === entry.season_number && p.episode_number === entry.episode_number
        );
        const next = idx >= 0 ? [...prev.slice(0, idx), entry, ...prev.slice(idx + 1)] : [entry, ...prev];
        localStorage.setItem(lsKey, JSON.stringify(next));
        return next;
      });
      return;
    }

    const { error } = await supabase
      .from('watch_progress')
      .upsert({
        user_id: userId,
        tmdb_id: item.id,
        media_type: mediaType,
        season_number: seasonNumber || null,
        episode_number: episodeNumber || null,
        resume_position: currentTime,
        duration,
        title: item.title || item.name || '',
        poster_path: item.poster_path || '',
        backdrop_path: item.backdrop_path || null,
      }, { onConflict: 'user_id,tmdb_id,media_type,season_number,episode_number' });
    if (error) console.error('Error saving progress:', error);
  }, [userId, isLocal, lsKey]);

  const getProgress = useCallback((itemId: number, season?: number, episode?: number) => {
    return progress.find(p =>
      p.tmdb_id === itemId &&
      (season != null ? p.season_number === season : true) &&
      (episode != null ? p.episode_number === episode : true)
    );
  }, [progress]);

  const clearProgress = useCallback(async (itemId: number, season?: number, episode?: number) => {
    if (!userId) return;
    let query = supabase.from('watch_progress').delete().eq('user_id', userId).eq('tmdb_id', itemId);
    if (season != null) query = query.eq('season_number', season);
    if (episode != null) query = query.eq('episode_number', episode);
    await query;
    refresh();
  }, [userId, refresh]);

  // Get continue watching items (not finished — resume_position < 90% of duration)
  const continueWatching = progress.filter(p => {
    if (p.duration === 0) return false;
    return p.resume_position / p.duration < 0.9;
  }).slice(0, 20);

  // Total watch time stats
  const watchStats = {
    movieTime: progress
      .filter(p => p.media_type === 'movie')
      .reduce((sum, p) => sum + Math.min(p.resume_position, p.duration), 0),
    tvTime: progress
      .filter(p => p.media_type === 'tv')
      .reduce((sum, p) => sum + Math.min(p.resume_position, p.duration), 0),
  };

  return { progress, loading, saveProgress, getProgress, clearProgress, continueWatching, watchStats, refresh };
}

// ── Reviews & Ratings ──

export interface ReviewItem {
  id: string;
  user_id: string;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  rating: number;
  review_text: string;
  is_spoiler: boolean;
  status: string;
  created_at: string;
  username?: string;
  avatar_url?: string | null;
}

export function useReviews(tmdbId: number | null, mediaType: 'movie' | 'tv' | null) {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userReview, setUserReview] = useState<ReviewItem | null>(null);

  const refresh = useCallback(async () => {
    if (!tmdbId || !mediaType) { setReviews([]); setLoading(false); return; }

    const { data, error } = await supabase
      .from('reviews')
      .select(`
        *,
        user_profiles!reviews_user_id_fkey (username, avatar_url)
      `)
      .eq('tmdb_id', tmdbId)
      .eq('media_type', mediaType)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) console.error('Error loading reviews:', error);
    setReviews((data || []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      tmdb_id: r.tmdb_id,
      media_type: r.media_type,
      rating: r.rating,
      review_text: r.review_text,
      is_spoiler: r.is_spoiler,
      status: r.status || 'approved',
      created_at: r.created_at,
      username: r.user_profiles?.username,
      avatar_url: r.user_profiles?.avatar_url,
    })) as ReviewItem[]);
    setLoading(false);
  }, [tmdbId, mediaType]);

  useEffect(() => { refresh(); }, [refresh]);

  const submitReview = useCallback(async (
    userId: string,
    rating: number,
    reviewText: string,
    isSpoiler: boolean,
  ) => {
    if (!tmdbId || !mediaType) return { error: 'missing' };

    const { error } = await supabase
      .from('reviews')
      .upsert({
        user_id: userId,
        tmdb_id: tmdbId,
        media_type: mediaType,
        rating,
        review_text: reviewText,
        is_spoiler: isSpoiler,
        status: 'pending',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,tmdb_id,media_type' });

    if (error) return { error: error.message };
    refresh();
    return { error: null };
  }, [tmdbId, mediaType, refresh]);

  const deleteReview = useCallback(async (reviewId: string) => {
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
    if (error) console.error('Error deleting review:', error);
    refresh();
  }, [refresh]);

  // Admin: fetch all pending reviews
  const fetchPendingReviews = useCallback(async () => {
    const { data, error } = await supabase
      .from('reviews')
      .select(`
        *,
        user_profiles!reviews_user_id_fkey (username, avatar_url)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error loading pending reviews:', error);
      return [];
    }
    return (data || []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      tmdb_id: r.tmdb_id,
      media_type: r.media_type,
      rating: r.rating,
      review_text: r.review_text,
      is_spoiler: r.is_spoiler,
      status: r.status,
      created_at: r.created_at,
      username: r.user_profiles?.username,
      avatar_url: r.user_profiles?.avatar_url,
    })) as ReviewItem[];
  }, []);

  // Admin: approve a review
  const approveReview = useCallback(async (reviewId: string) => {
    const { error } = await supabase.from('reviews').update({ status: 'approved' }).eq('id', reviewId);
    if (error) console.error('Error approving review:', error);
  }, []);

  // Admin: reject (delete) a review
  const rejectReview = useCallback(async (reviewId: string) => {
    const { error } = await supabase.from('reviews').update({ status: 'rejected' }).eq('id', reviewId);
    if (error) console.error('Error rejecting review:', error);
  }, []);

  return { reviews, loading, userReview, submitReview, deleteReview, fetchPendingReviews, approveReview, rejectReview, refresh };
}
