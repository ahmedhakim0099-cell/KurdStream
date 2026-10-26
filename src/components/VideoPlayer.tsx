import { useState, useEffect, useCallback } from 'react';
import {
  Subtitles, Loader2, Film, Tv, CheckCircle2,
  Settings, Calendar, Star, ChevronLeft, Server, AlertCircle,
  Heart, Bookmark, ListChecks, Clock3, ChevronDown, ChevronUp as ExpandUp,
  Users, Sparkles,
} from 'lucide-react';
import AuthModal from '@/components/AuthModal';
import type { MediaItem, TvDetails, Episode, Season } from '@/types';
import { translateSynopsis } from '@/subtitleApi';
import { useAuth } from '@/lib/auth';
import { useUserLists, useEpisodeProgress, useWatchProgress } from '@/lib/userData';
import { supabase } from '@/lib/supabase';
import ReviewsSection from '@/components/ReviewsSection';
import WatchParty from '@/components/WatchParty';
import NovaPlayer from '@/components/NovaPlayer';
import VidboltPlayer from '@/components/VidboltPlayer';

const API_KEY = '7d14dee38d0eb74c7fd96bec8dceefd5';
const BASE_URL = 'https://api.themoviedb.org/3';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const genreMap: Record<number, string> = {
  28: 'ئاکشن', 12: 'سەرکێشی', 16: 'ئەنیمەیشن', 35: 'کۆمیدی', 80: 'تاوانکاری',
  99: 'دۆکیومێنتاری', 18: 'دراما', 10751: 'خێزانی', 14: 'فەنتازیا', 36: 'مێژوویی',
  27: 'ترسناک', 10402: 'موزیک', 9648: 'نھێنی', 10749: 'ڕۆمانسی', 878: 'خەیاڵی زانستی',
  10770: 'فیلمی تەلەفزیۆنی', 53: 'هەستبزوێن', 10752: 'جەنگی', 37: 'وێسترن',
  10759: 'ئاکشن و سەرکێشی', 10765: 'خەیاڵی و فەنتازیا', 10768: 'جەنگی و سیاسەت'
};

type ServerMode = 'nova' | 'main' | 'beta' | 'alpha' | 'onyx' | 'cobalt' | 'vidbolt';

function buildVidcoreUrl(tmdbId: number, isTv: boolean, season: number, episode: number): string {
  return isTv
    ? `https://vidcore.org/embed/tv/${tmdbId}/${season}/${episode}`
    : `https://vidcore.org/embed/movie/${tmdbId}`;
}

function buildVidlinkUrl(tmdbId: number, isTv: boolean, season: number, episode: number): string {
  return isTv
    ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
    : `https://vidlink.pro/movie/${tmdbId}`;
}

function buildVidlinkSubtitleParams(subtitleVttUrl?: string | null, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  params.set('autoplay', 'true');
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  if (subtitleVttUrl) {
    params.set('sub_file', subtitleVttUrl);
    params.set('sub_label', 'کوردی - سۆرانی');
  }
  return params.toString();
}

function buildServerUrl(
  server: ServerMode,
  tmdbId: number,
  isTv: boolean,
  season: number,
  episode: number,
  subtitleVttUrl?: string | null,
): string {
  const vidcore = buildVidcoreUrl(tmdbId, isTv, season, episode);

  switch (server) {
    case 'nova':
      return '';

    case 'main':
      return vidcore;

    case 'beta': {
      const base = buildVidlinkUrl(tmdbId, isTv, season, episode);
      const qs = buildVidlinkSubtitleParams(subtitleVttUrl, { fallback_url: vidcore });
      return `${base}?${qs}`;
    }

    case 'alpha':
      return isTv
        ? `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}`
        : `https://www.2embed.cc/embed/${tmdbId}`;

    case 'onyx':
      return isTv
        ? `https://player.vidzee.wtf/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://player.vidzee.wtf/embed/movie/${tmdbId}`;

    case 'cobalt': {
      const base = buildVidlinkUrl(tmdbId, isTv, season, episode);
      const qs = buildVidlinkSubtitleParams(subtitleVttUrl, { player: 'jw', fallback_url: vidcore });
      return `${base}?${qs}`;
    }

    case 'vidbolt':
      return '';
  }
}

const SERVERS: { mode: ServerMode; label: string; activeClass: string }[] = [
  { mode: 'nova', label: 'Nova', activeClass: 'bg-amber-600 border-amber-400/50 text-white shadow-lg shadow-amber-600/30' },
  { mode: 'main', label: 'Main', activeClass: 'bg-blue-600 border-blue-400/50 text-white shadow-lg shadow-blue-600/30' },
  { mode: 'beta', label: 'Beta', activeClass: 'bg-violet-600 border-violet-400/50 text-white shadow-lg shadow-violet-600/30' },
  { mode: 'alpha', label: 'Alpha', activeClass: 'bg-sky-600 border-sky-400/50 text-white shadow-lg shadow-sky-600/30' },
  { mode: 'onyx', label: 'Onyx', activeClass: 'bg-emerald-600 border-emerald-400/50 text-white shadow-lg shadow-emerald-600/30' },
  { mode: 'cobalt', label: 'Cobalt', activeClass: 'bg-cyan-600 border-cyan-400/50 text-white shadow-lg shadow-cyan-600/30' },
  { mode: 'vidbolt', label: 'Vidbolt', activeClass: 'bg-rose-600 border-rose-400/50 text-white shadow-lg shadow-rose-600/30' },
];

interface PlayerProps {
  item: MediaItem;
  onClose: () => void;
  onRequireAuth?: () => void;
}

export default function VideoPlayer({ item, onClose }: PlayerProps) {
  const [tvDetails, setTvDetails] = useState<TvDetails | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodesList, setEpisodesList] = useState<Episode[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState(1);

  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [hasKurdishSub, setHasKurdishSub] = useState(false);
  const [subtitleVttUrl, setSubtitleVttUrl] = useState<string | null>(null);

  const [serverMode, setServerMode] = useState<ServerMode>('nova');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [translatedOverview, setTranslatedOverview] = useState('');
  const [runtime, setRuntime] = useState<number | null>(null);
  const [showWatchParty, setShowWatchParty] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const [novaFailed, setNovaFailed] = useState(false);

  const isTv = item.media_type === 'tv' || !item.title;
  const title = item.title || item.name || '';
  const year = (item.release_date || item.first_air_date)?.substring(0, 4) || '';

  useEffect(() => {
    setRuntime(null);
    if (isTv) {
      fetch(`${BASE_URL}/tv/${item.id}?api_key=${API_KEY}`)
        .then(r => r.json())
        .then((data: any) => {
          if (data.episode_run_time?.length > 0) setRuntime(data.episode_run_time[0]);
        })
        .catch(() => {});
    } else {
      fetch(`${BASE_URL}/movie/${item.id}?api_key=${API_KEY}`)
        .then(r => r.json())
        .then((data: any) => {
          if (data.runtime) setRuntime(data.runtime);
        })
        .catch(() => {});
    }
  }, [item.id, isTv]);

  const formatRuntime = (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}ک ${m}د` : `${m}د`;
  };

  const { user } = useAuth();
  const { toggleList, isInList } = useUserLists(user?.id || null);
  const { markEpisodeWatched, isEpisodeWatched, toggleEpisodeWatched } = useEpisodeProgress(user?.id || null, isTv ? item.id : null);
  const { saveProgress } = useWatchProgress(user?.id || null);

  const handleWatchedToggle = useCallback(async () => {
    if (!user) { setShowAuthModal(true); return; }
    const wasWatched = isInList(item.id, 'watched');
    toggleList(item, 'watched');
    if (!wasWatched) {
      const rt = runtime || 0;
      if (rt > 0) {
        saveProgress(item, rt, rt, undefined, undefined);
      }
    }
  }, [user, toggleList, isInList, item, runtime, saveProgress]);

  useEffect(() => {
    if (!item.overview) { setTranslatedOverview(''); return; }
    setTranslatedOverview('');
    let cancelled = false;
    translateSynopsis(item.overview).then(t => { if (!cancelled) setTranslatedOverview(t); });
    return () => { cancelled = true; };
  }, [item.overview]);

  useEffect(() => {
    if (isTv) {
      fetch(`${BASE_URL}/tv/${item.id}?api_key=${API_KEY}`)
        .then(r => r.json())
        .then((data: TvDetails) => {
          setTvDetails(data);
          if (data.seasons && data.seasons.length > 0) {
            const firstSeasonNum = data.seasons.find((s: Season) => s.season_number > 0)?.season_number || 1;
            setSelectedSeason(firstSeasonNum);
            fetchEpisodes(item.id, firstSeasonNum);
          }
        });
    }
  }, [item.id]);

  const fetchEpisodes = async (tvId: number, seasonNum: number) => {
    try {
      const res = await fetch(`${BASE_URL}/tv/${tvId}/season/${seasonNum}?api_key=${API_KEY}`);
      const data = await res.json();
      setEpisodesList(data.episodes || []);
      if (data.episodes && data.episodes.length > 0) {
        setSelectedEpisode(data.episodes[0].episode_number);
      }
    } catch (err) { console.error(err); }
  };

  // Query subtitles table for Kurdish subtitle existence on media/episode change
  useEffect(() => {
    let cancelled = false;
    setSubtitleLoading(true);
    setHasKurdishSub(false);
    setSubtitleVttUrl(null);

    (async () => {
      try {
        let query = supabase
          .from('subtitles')
          .select('id, file_url')
          .eq('tmdb_id', item.id)
          .eq('media_type', isTv ? 'tv' : 'movie');

        if (isTv) {
          query = query.eq('season_number', selectedSeason).eq('episode_number', selectedEpisode);
        } else {
          query = query.is('season_number', null).is('episode_number', null);
        }

        const { data } = await query.maybeSingle();
        if (cancelled) return;

        if (data) {
          setHasKurdishSub(true);
          const fileUrl = (data as { file_url?: string | null }).file_url
            || `${SUPABASE_URL}/storage/v1/object/public/subtitles/${isTv ? `tv-${item.id}-s${selectedSeason}e${selectedEpisode}.vtt` : `movie-${item.id}.vtt`}`;
          setSubtitleVttUrl(fileUrl);
        } else {
          setHasKurdishSub(false);
          setSubtitleVttUrl(null);
        }
      } catch {
        if (!cancelled) {
          setHasKurdishSub(false);
          setSubtitleVttUrl(null);
        }
      } finally {
        if (!cancelled) setSubtitleLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [item.id, isTv, selectedSeason, selectedEpisode]);

  useEffect(() => {
    if (serverMode !== 'beta' && serverMode !== 'cobalt') return;
    setShowSlowHint(false);
    const timer = setTimeout(() => setShowSlowHint(true), 30000);
    return () => clearTimeout(timer);
  }, [serverMode, item.id, selectedSeason, selectedEpisode]);

  const tmdbIdValid = typeof item.id === 'number' && item.id > 0;
  const serverSrc = tmdbIdValid
    ? buildServerUrl(serverMode, item.id, isTv, selectedSeason, selectedEpisode, subtitleVttUrl)
    : '';
  const iframeKey = `${serverMode}-${item.id}-${selectedSeason}-${selectedEpisode}`;

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-[#08080a] via-[#0d0e12] to-[#12131a] overflow-y-auto">
      <div className="min-h-screen relative">
        {/* HERO BACKDROP */}
        <div className="relative w-full h-[40vh] lg:h-[55vh] overflow-hidden">
          <img
            src={`https://image.tmdb.org/t/p/original${item.backdrop_path || item.poster_path}`}
            alt=""
            className="w-full h-full object-cover scale-105"
            style={{ filter: 'brightness(0.45) saturate(1.1)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-[#0d0e12]/50 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#08080a]/80 to-transparent"></div>
          <button
            onClick={onClose}
            className="absolute top-6 left-6 z-50 flex items-center gap-2 bg-black/40 backdrop-blur-xl px-4 py-2.5 rounded-full hover:bg-amber-600/80 transition-all border border-amber-500/10 shadow-2xl group"
          >
            <ChevronLeft className="w-5 h-5 text-white group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-white/90 text-sm font-bold">گەڕانەوە</span>
          </button>
        </div>

        {/* TITLE SECTION */}
        <div className="container mx-auto px-4 lg:px-8 relative z-20 -mt-32 lg:-mt-44">
          <div className="flex flex-col lg:flex-row gap-8">
            <div className="w-36 lg:w-56 flex-shrink-0 mx-auto lg:mx-0">
              <img
                src={`https://image.tmdb.org/t/p/w500${item.poster_path}`}
                alt={title}
                className="w-full rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] border border-white/10 ring-1 ring-white/5"
              />
            </div>
            <div className="flex-1 mt-4 lg:mt-16">
              <h1 className="text-3xl lg:text-5xl font-black text-white drop-shadow-2xl mb-3 tracking-tight leading-tight">
                {title}
              </h1>
              <div className="flex flex-wrap items-center gap-2.5 mb-5">
                {item.vote_average != null && item.vote_average > 0 && (
                  <span className="flex items-center gap-1.5 bg-amber-500/15 text-amber-400 px-3.5 py-1.5 rounded-lg font-bold border border-amber-500/25 text-sm">
                    <Star className="w-4 h-4 fill-amber-400" />
                    {item.vote_average.toFixed(1)}
                    <span className="text-amber-400/60 text-[10px] font-medium ml-0.5">/10</span>
                  </span>
                )}
                {year && (
                  <span className="flex items-center gap-1.5 bg-white/8 text-white/90 px-3.5 py-1.5 rounded-lg border border-white/5 text-sm">
                    <Calendar className="w-4 h-4 text-white/50" />
                    {year}
                  </span>
                )}
                <span className="flex items-center gap-1.5 bg-amber-500/15 text-amber-400 px-3.5 py-1.5 rounded-lg border border-amber-500/25 font-bold text-sm">
                  {isTv ? <Tv className="w-4 h-4" /> : <Film className="w-4 h-4" />}
                  {isTv ? 'زنجیرە' : 'فیلم'}
                </span>
                {runtime != null && runtime > 0 && (
                  <span className="flex items-center gap-1.5 bg-blue-500/15 text-blue-400 px-3.5 py-1.5 rounded-lg border border-blue-500/25 font-bold text-sm">
                    <Clock3 className="w-4 h-4" />
                    {isTv ? `${formatRuntime(runtime)} / ئەڵقە` : formatRuntime(runtime)}
                  </span>
                )}
                {isTv && tvDetails && (
                  <>
                    {tvDetails.number_of_seasons != null && (
                      <span className="flex items-center gap-1.5 bg-blue-500/15 text-blue-400 px-3.5 py-1.5 rounded-lg border border-blue-500/25 font-bold text-sm">
                        <Settings className="w-4 h-4" />
                        کۆی وەرزەکان: {tvDetails.number_of_seasons}
                      </span>
                    )}
                    {tvDetails.seasons && (
                      <span className="flex items-center gap-1.5 bg-blue-500/15 text-blue-400 px-3.5 py-1.5 rounded-lg border border-blue-500/25 font-bold text-sm">
                        <ListChecks className="w-4 h-4" />
                        کۆی ئەڵقەکان: {tvDetails.seasons.reduce((sum: number, s: Season) => sum + (s.episode_count || 0), 0)}
                      </span>
                    )}
                  </>
                )}
                {hasKurdishSub && (
                  <span className="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 px-3.5 py-1.5 rounded-lg border border-emerald-500/25 font-bold text-sm">
                    <Subtitles className="w-4 h-4" /> ژێرنوسی کوردی
                  </span>
                )}
                {subtitleLoading && (
                  <span className="flex items-center gap-1.5 bg-amber-500/15 text-amber-400 px-3.5 py-1.5 rounded-lg border border-amber-500/25 font-bold text-sm animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin" /> گەڕان...
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mb-5">
                {(item.genres?.map(g => g.name) || item.genre_ids?.map(id => genreMap[id]) || []).filter(Boolean).slice(0, 5).map((g, i) => (
                  <span key={i} className="bg-white/5 border border-white/10 text-white/70 px-3 py-1 rounded-md text-xs font-medium hover:bg-white/10 hover:text-white/90 transition cursor-default">
                    {g}
                  </span>
                ))}
              </div>
              <div className="max-w-2xl">
                <p
                  className={`text-white/65 leading-relaxed text-sm lg:text-base ${overviewExpanded ? '' : 'line-clamp-3'}`}
                  dir="rtl"
                >
                  {translatedOverview || item.overview || 'کورتەی ئەم بەرهەمە بەردەست نییە...'}
                </p>
                {(translatedOverview || item.overview) && (translatedOverview || item.overview || '').length > 150 && (
                  <button
                    onClick={() => setOverviewExpanded(v => !v)}
                    className="flex items-center gap-1 text-amber-400 hover:text-amber-300 text-xs font-bold mt-1.5 transition"
                  >
                    {overviewExpanded ? <><ChevronDown className="w-3.5 h-3.5" /> کەمتر</> : <><ExpandUp className="w-3.5 h-3.5" /> بینینی زیاتر</>}
                  </button>
                )}
              </div>
              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 mt-5">
                <button
                  onClick={handleWatchedToggle}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border ${
                    isInList(item.id, 'watched')
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" /> بینراو
                </button>
                <button
                  onClick={() => { if (!user) { setShowAuthModal(true); return; } toggleList(item, 'favorites'); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border ${
                    isInList(item.id, 'favorites')
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <Heart className="w-4 h-4" /> دڵخوازەکان
                </button>
                <button
                  onClick={() => { if (!user) { setShowAuthModal(true); return; } toggleList(item, 'watch_later'); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border ${
                    isInList(item.id, 'watch_later')
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <Bookmark className="w-4 h-4" /> بینینی دواتر
                </button>
                <button
                  onClick={() => setShowWatchParty(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border bg-white/5 text-white/60 border-white/10 hover:bg-amber-500/15 hover:text-amber-400 hover:border-amber-500/30"
                >
                  <Users className="w-4 h-4" /> سەیری بەیەکەوە بکە
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* PLAYER AREA */}
        <div className="container mx-auto px-4 lg:px-8 mt-10 pb-24">
          <div className="max-w-6xl mx-auto">
            {/* TV Season/Episode selector */}
            {isTv && tvDetails && (
              <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 lg:p-6 rounded-2xl mb-5">
                <div className="flex items-center gap-2 mb-4">
                  <Settings className="w-5 h-5 text-amber-400" />
                  <span className="text-white/90 font-bold text-base">وەرز و ئەڵقە</span>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {tvDetails.seasons?.filter(s => s.season_number > 0).map(season => (
                    <button
                      key={season.id}
                      onClick={() => {
                        setSelectedSeason(season.season_number);
                        fetchEpisodes(item.id, season.season_number);
                      }}
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition-all border ${selectedSeason === season.season_number
                        ? 'bg-amber-600 border-amber-400/50 text-white shadow-lg shadow-amber-600/20'
                        : 'bg-black/30 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90'}`}
                    >
                      وەرز {season.season_number}
                    </button>
                  ))}
                </div>
                {episodesList.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-xs font-bold text-white/40 uppercase tracking-wider">ئەڵقەکان</p>
                      {selectedEpisode && (
                        <button
                          onClick={() => {
                            if (!user) { setShowAuthModal(true); return; }
                            const wasEpWatched = isEpisodeWatched(selectedSeason, selectedEpisode);
                            toggleEpisodeWatched(selectedSeason, selectedEpisode);
                            if (!wasEpWatched) {
                              const rt = runtime || 0;
                              if (rt > 0) saveProgress(item, rt * 60, rt * 60, selectedSeason, selectedEpisode);
                            }
                          }}
                          className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                            isEpisodeWatched(selectedSeason, selectedEpisode)
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                              : 'bg-white/5 text-white/60 border-white/10 hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-500/30'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {isEpisodeWatched(selectedSeason, selectedEpisode) ? 'بینراو' : 'نیشانەکردن وەک بینراو'}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-44 overflow-y-auto p-1.5 bg-black/20 rounded-xl border border-white/5">
                      {episodesList.map(ep => {
                        const watched = isEpisodeWatched(selectedSeason, ep.episode_number);
                        return (
                          <button
                            key={ep.id}
                            onClick={() => setSelectedEpisode(ep.episode_number)}
                            className={`relative py-2 px-2 rounded-lg font-bold text-xs transition-all border ${selectedEpisode === ep.episode_number
                              ? 'bg-blue-600 border-blue-400/50 text-white shadow-md shadow-blue-600/20'
                              : watched
                                ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30'
                                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'}`}
                          >
                            {ep.episode_number}
                            {watched && (
                              <CheckCircle2 className="absolute -top-1 -right-1 w-3 h-3 text-emerald-400 fill-[#0d0e12]" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {isEpisodeWatched(selectedSeason, selectedEpisode) && (
                      <p className="text-emerald-400/70 text-xs mt-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3" />
                        ئەڵقەکانی پێشتر وەک بینراو نیشانە کراون خۆکارانە
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ═══════════════ SERVER SWITCHER ═══════════════ */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              {SERVERS.map(srv => (
                <button
                  key={srv.mode}
                  onClick={() => setServerMode(srv.mode)}
                  className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all border ${serverMode === srv.mode ? srv.activeClass : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90'}`}
                >
                  {srv.mode === 'nova' ? <Sparkles className="w-4 h-4" /> : <Server className="w-4 h-4" />}
                  {srv.label}
                  {hasKurdishSub && (srv.mode === 'beta' || srv.mode === 'cobalt' || srv.mode === 'nova' || srv.mode === 'vidbolt') && (
                    <span className="ml-1 w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                  {serverMode === srv.mode && (
                    <span className="ml-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </button>
              ))}
            </div>

            {/* ═══════════════ VIDEO PLAYER ═══════════════ */}
            <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.85)] bg-black">
              <div className="relative w-full bg-black" style={{ aspectRatio: '16 / 9' }}>
                {tmdbIdValid && serverMode === 'nova' ? (
                  <NovaPlayer
                    tmdbId={item.id}
                    mediaType={isTv ? 'tv' : 'movie'}
                    season={isTv ? selectedSeason : undefined}
                    episode={isTv ? selectedEpisode : undefined}
                    kurdishVttUrl={subtitleVttUrl}
                    onFailed={() => { setNovaFailed(true); setServerMode('main'); }}
                  />
                ) : tmdbIdValid && serverMode === 'vidbolt' ? (
                  <VidboltPlayer
                    tmdbId={item.id}
                    mediaType={isTv ? 'tv' : 'movie'}
                    season={isTv ? selectedSeason : undefined}
                    episode={isTv ? selectedEpisode : undefined}
                    kurdishVttUrl={subtitleVttUrl}
                    onFailed={() => setServerMode('main')}
                  />
                ) : tmdbIdValid ? (
                  <iframe
                    key={iframeKey}
                    src={serverSrc}
                    allowFullScreen
                    width="100%"
                    height="100%"
                    className="absolute inset-0 w-full h-full"
                    style={{ border: 'none' }}
                    allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-center p-6">
                    <div>
                      <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                      <p className="text-white/70 text-sm font-bold mb-2">TMDB ID نادروستە — کارنەکات</p>
                      <p className="text-white/30 text-xs font-mono break-all" dir="ltr">
                        id={String(item.id)} | {isTv ? 'tv' : 'movie'}
                      </p>
                    </div>
                  </div>
                )}
                {/* Subtitle loading overlay */}
                {subtitleLoading && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
                    <div className="text-center">
                      <div className="relative w-14 h-14 mx-auto mb-3">
                        <div className="absolute inset-0 border-2 border-amber-500/20 rounded-full"></div>
                        <div className="absolute inset-0 border-2 border-transparent border-t-amber-400 rounded-full animate-spin"></div>
                      </div>
                      <p className="text-white/80 text-sm font-bold flex items-center gap-2 justify-center">
                        <Subtitles className="w-4 h-4 text-amber-400" />
                        ئامادەکردنی ژێرنوسی کوردی...
                      </p>
                    </div>
                  </div>
                )}
                {/* Hint banner */}
                {!subtitleLoading && (
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10 pointer-events-none">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400/70" />
                    <span className="text-white/50 text-[10px] font-bold">ئەگەر کار نەکا، سێرڤەرێکی تر تاقیبکەرەوە</span>
                  </div>
                )}
              </div>
            </div>

            {/* Subtitle status badge */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {subtitleLoading ? (
                <span className="flex items-center gap-1.5 bg-amber-500/15 text-amber-400 px-3 py-1.5 rounded-lg border border-amber-500/25 font-bold text-xs animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ژێرنووسی کوردی: گەڕان...
                </span>
              ) : hasKurdishSub ? (
                <span className="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-500/25 font-bold text-xs">
                  <Subtitles className="w-3.5 h-3.5" />
                  ژێرنووسی کوردی: هەیە
                </span>
              ) : (
                <span className="flex items-center gap-1.5 bg-white/5 text-white/40 px-3 py-1.5 rounded-lg border border-white/10 font-bold text-xs">
                  <Subtitles className="w-3.5 h-3.5" />
                  ژێرنووسی کوردی: نییە
                </span>
              )}
              {tmdbIdValid && serverSrc && serverMode !== 'nova' && serverMode !== 'vidbolt' && (
                <a
                  href={serverSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-white/40 hover:text-cyan-400 text-xs font-bold transition"
                >
                  <Server className="w-3.5 h-3.5" />
                  کردنەوەی سێرڤەر لە تابێکی نوێ
                </a>
              )}
            </div>
            {/* DEBUG: show the exact iframe URL */}
            {tmdbIdValid && serverMode !== 'nova' && serverMode !== 'vidbolt' && serverSrc && (
              <p className="mt-2 text-[10px] text-white/25 font-mono break-all" dir="ltr">
                {serverSrc}
              </p>
            )}
            {tmdbIdValid && serverMode === 'nova' && (
              <p className="mt-2 text-[10px] text-white/25 font-mono break-all" dir="ltr">
                Nova — own HLS player (resolve-stream edge function)
              </p>
            )}
            {tmdbIdValid && serverMode === 'vidbolt' && (
              <p className="mt-2 text-[10px] text-white/25 font-mono break-all" dir="ltr">
                Vidbolt — direct HLS/MP4 player (inspectVidbolt)
              </p>
            )}
            {/* Nova fallback hint */}
            {novaFailed && serverMode === 'main' && (
              <div className="mt-3 flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 rounded-xl px-4 py-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-amber-400 text-sm font-bold" dir="rtl">نۆڤا بەردەست نییە — گەڕایەوە سێرڤەری Main</span>
              </div>
            )}
            {/* Slow-server hint for Beta/Cobalt */}
            {showSlowHint && (serverMode === 'beta' || serverMode === 'cobalt') && (
              <div className="mt-3 flex items-center justify-between gap-3 bg-amber-500/15 border border-amber-500/30 rounded-xl px-4 py-2.5">
                <span className="text-amber-400 text-sm font-bold" dir="rtl">
                  ئەگەر ئەم سێرڤەرە کار نەکات، سێرڤەری Main تاقی بکەرەوە
                </span>
                <button
                  onClick={() => setShowSlowHint(false)}
                  className="text-amber-400/60 hover:text-amber-400 text-xs font-bold"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Reviews & Ratings Section */}
          <ReviewsSection tmdbId={item.id} mediaType={isTv ? 'tv' : 'movie'} />
        </div>
      </div>
      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
      {showWatchParty && <WatchParty item={item} onClose={() => setShowWatchParty(false)} />}
    </div>
  );
}
