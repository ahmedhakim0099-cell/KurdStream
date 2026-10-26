import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Play, X, Star, Film, Tv, Trophy, Flame,
  Settings, Loader2, ChevronLeft, ChevronRight, Bot, Sparkles,
  User, Heart, Bookmark, CheckCircle2, Clock, Calendar, Home as HomeIcon,
  LayoutGrid, TrendingUp, Filter, Check, Globe, Languages, MapPin, Tag, Zap,
} from 'lucide-react';
import type { MediaItem } from '@/types';
import VideoPlayer from '@/components/VideoPlayer';
import HeroSlider from '@/components/HeroSlider';
import AdminDashboard from '@/components/AdminDashboard';
import ErrorBoundary from '@/components/ErrorBoundary';
import AccentPicker from '@/components/AccentPicker';
import AIBot from '@/components/AIBot';
import AuthModal from '@/components/AuthModal';
import ProfilePage from '@/components/ProfilePage';
import { applyAccent, getStoredAccent, applyCinematic, getStoredCinematic, applyPalette, getStoredPalette, type CinematicKey } from '@/accentTheme';
import CinematicParticles from '@/components/CinematicParticles';
import { PosterSkeletonGrid } from '@/components/PosterSkeleton';
import { MediaCard, PosterGrid, CarouselRow, type CardContextProps } from '@/components/MediaCard';
import { Trophy as TrophyIcon, Clock3 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useUserLists, useWatchProgress, type WatchProgressItem } from '@/lib/userData';
import { supabase } from '@/lib/supabase';
import { corsFetchJson } from '@/lib/corsFetch';
import MoodMatchmaker from '@/components/MoodMatchmaker';

const API_KEY = '7d14dee38d0eb74c7fd96bec8dceefd5';
const BASE_URL = 'https://api.themoviedb.org/3';

// Genres to exclude for content safety (erotica/adult) — Romance (10749) is NOT excluded
const EXCLUDED_GENRE_IDS = new Set<number>([]); // TMDB doesn't have explicit erotica genre IDs in standard lists
const EXPLICIT_KEYWORDS = /^(erotica|erotic|softcore|hardcore|adult|porn|xxx|erotic thriller|sex comedy)/i;

// Frontend content safety filter: removes items with explicit keywords in title/overview
function filterExplicitContent(items: MediaItem[]): MediaItem[] {
  return items.filter(item => {
    if (!item) return false;
    const title = (item.title || item.name || '').toLowerCase();
    const overview = (item.overview || '').toLowerCase();
    if (EXPLICIT_KEYWORDS.test(title)) return false;
    if (EXPLICIT_KEYWORDS.test(overview)) return false;
    // Also check genre_ids for any known adult genre IDs
    if (item.genre_ids && item.genre_ids.some(id => EXCLUDED_GENRE_IDS.has(id))) return false;
    return true;
  });
}

// Helper to build TMDB URL with include_adult=false always included
function tmdbUrl(path: string, params: string = ''): string {
  const sep = params ? '&' : '';
  return `${BASE_URL}${path}?api_key=${API_KEY}&include_adult=false${sep}${params}`;
}

const genreMap: Record<number, string> = {
  28: 'ئاکشن', 12: 'سەرکێشی', 16: 'ئەنیمەیشن', 35: 'کۆمیدی', 80: 'تاوانکاری',
  99: 'دۆکیومێنتاری', 18: 'دراما', 10751: 'خێزانی', 14: 'فەنتازیا', 36: 'مێژوویی',
  27: 'ترسناک', 10402: 'موزیک', 9648: 'نھێنی', 10749: 'ڕۆمانسی', 878: 'خەیاڵی زانستی',
  10770: 'فیلمی تەلەفزیۆنی', 53: 'هەستبزوێن', 10752: 'جەنگی', 37: 'وێسترن',
  10759: 'ئاکشن و سەرکێشی', 10765: 'خەیاڵی و فەنتازیا', 10768: 'جەنگی و سیاسەت'
};

const LANGUAGES = [
  { code: '', label: 'هەموو زمانەکان' },
  { code: 'en', label: 'ئینگلیزی' },
  { code: 'ku', label: 'کوردی' },
  { code: 'fa', label: 'فارسی' },
  { code: 'tr', label: 'تورکی' },
  { code: 'ko', label: 'کۆری' },
  { code: 'fr', label: 'فەرەنسی' },
  { code: 'es', label: 'ئیسپانی' },
  { code: 'ja', label: 'یابانی' },
  { code: 'ar', label: 'عەرەبی' },
  { code: 'de', label: 'ئەڵمانی' },
  { code: 'hi', label: 'هیندی' },
  { code: 'zh', label: 'چینی' },
  { code: 'it', label: 'ئیتاڵی' },
  { code: 'ru', label: 'ڕووسی' },
];

const COUNTRIES = [
  { code: '', label: 'هەموو وڵاتەکان' },
  { code: 'US', label: 'ئەمریکا' },
  { code: 'GB', label: 'بەریتانیا' },
  { code: 'KR', label: 'کۆریای باشوور' },
  { code: 'TR', label: 'تورکیا' },
  { code: 'FR', label: 'فەرەنسا' },
  { code: 'JP', label: 'یابان' },
  { code: 'DE', label: 'ئەڵمانیا' },
  { code: 'IR', label: 'ئێران' },
  { code: 'IN', label: 'هیندستان' },
  { code: 'CN', label: 'چین' },
  { code: 'ES', label: 'ئیسپانیا' },
  { code: 'IT', label: 'ئیتاڵیا' },
  { code: 'RU', label: 'ڕووسیا' },
  { code: 'MX', label: 'مەکسیک' },
  { code: 'CA', label: 'کەنەدا' },
  { code: 'AU', label: 'ئوسترالیا' },
];

const TOP250_PAGE_SIZE = 20;

// Marvel collection uses a TMDB keyword search instead of genre IDs (keyword 180923 = Marvel)
const MARVEL_KEYWORD_ID = 180923;

// Genre-based collections for the Collections tab
const COLLECTIONS = [
  { id: 'marvel', title: 'کۆکراوەی مارڤل', icon: Zap, genreIds: [], keywordId: MARVEL_KEYWORD_ID, color: '#dc2626' },
  { id: 'action', title: 'ئەکشن و جەنگی', icon: Flame, genreIds: [28, 10752], color: '#ef4444' },
  { id: 'anime', title: 'ئەنیمێ و ئەنیمەیشن', icon: Sparkles, genreIds: [16], color: '#06b6d4' },
  { id: 'scifi', title: 'خەیاڵی زانستی', icon: Film, genreIds: [878, 14], color: '#8b5cf6' },
  { id: 'drama', title: 'دراما', icon: Film, genreIds: [18], color: '#10b981' },
  { id: 'comedy', title: 'کۆمیدی', icon: Film, genreIds: [35], color: '#f59e0b' },
  { id: 'horror', title: 'ترسناک', icon: Film, genreIds: [27, 53], color: '#dc2626' },
  { id: 'crime', title: 'تاوانکاری و نھێنی', icon: Film, genreIds: [80, 9648], color: '#6366f1' },
];

interface Genre { id: number; name: string }

export default function App() {
  const [route, setRoute] = useState(window.location.pathname);
  const [activeTab, setActiveTab] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchDropdownRef = useRef<HTMLDivElement | null>(null);
  const [searchPageInput, setSearchPageInput] = useState('');

  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [popularMovies, setPopularMovies] = useState<MediaItem[]>([]);
  const [popularTv, setPopularTv] = useState<MediaItem[]>([]);
  const [topRated, setTopRated] = useState<MediaItem[]>([]);
  const [recommended, setRecommended] = useState<MediaItem[]>([]);
  const [anime, setAnime] = useState<MediaItem[]>([]);
  const [actionWar, setActionWar] = useState<MediaItem[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<MediaItem[]>([]);
  const [collectionData, setCollectionData] = useState<Record<string, MediaItem[]>>({});
  const [activeCollection, setActiveCollection] = useState<string | null>(null);

  // Paginated browsing states (Movies / Series / Collections detail)
  const [browseItems, setBrowseItems] = useState<MediaItem[]>([]);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false);
  const [browseHasMore, setBrowseHasMore] = useState(true);
  const [movieGenres, setMovieGenres] = useState<Genre[]>([]);
  const [tvGenres, setTvGenres] = useState<Genre[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [showGenreFilter, setShowGenreFilter] = useState(false);
  const browseSentinel = useRef<HTMLDivElement | null>(null);

  // IMDb Top 250
  const [top250, setTop250] = useState<MediaItem[]>([]);
  // top250Visible removed — we now render all loaded items and append via infinite scroll
  const [top250Loading, setTop250Loading] = useState(false);
  const [top250LoadingMore, setTop250LoadingMore] = useState(false);

  // IMDb Top 250 TV
  const [top250Tv, setTop250Tv] = useState<MediaItem[]>([]);
  const [top250TvPage, setTop250TvPage] = useState(1);
  const [top250TvLoading, setTop250TvLoading] = useState(false);
  const [top250TvLoadingMore, setTop250TvLoadingMore] = useState(false);
  const [top250TvHasMore, setTop250TvHasMore] = useState(true);
  const top250TvSentinel = useRef<HTMLDivElement | null>(null);

  // Cinematic theme state
  const [cinematicTheme, setCinematicTheme] = useState<CinematicKey | null>(null);

  // Rating range filter
  const [minRating, setMinRating] = useState(0);
  const [showRatingFilter, setShowRatingFilter] = useState(false);

  // Classic filter
  const [classicOnly, setClassicOnly] = useState(false);

  // Language & Country filters
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [showLangFilter, setShowLangFilter] = useState(false);
  const [showCountryFilter, setShowCountryFilter] = useState(false);

  // Year filter
  const [selectedYear, setSelectedYear] = useState<number | ''>('');
  const [showYearFilter, setShowYearFilter] = useState(false);
  const currentYear = new Date().getFullYear();
  const YEAR_OPTIONS: number[] = Array.from({ length: currentYear - 1949 }, (_, i) => currentYear - i);

  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [aiBotOpen, setAiBotOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const { user, profile, isAdmin } = useAuth();
  const { toggleList, isInList } = useUserLists(user?.id || null);
  const { continueWatching } = useWatchProgress(user?.id || null);

  // Soft-deleted items: TMDB IDs that admin has hidden from public view
  const [deletedItemIds, setDeletedItemIds] = useState<Set<number>>(new Set());
  const deletedIdsArray = useMemo(() => Array.from(deletedItemIds), [deletedItemIds]);

  const fetchDeletedItems = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('deleted_items').select('tmdb_id');
      if (error) { setDeletedItemIds(new Set()); return; }
      setDeletedItemIds(new Set((data || []).map((d: { tmdb_id: number }) => d.tmdb_id)));
    } catch {
      setDeletedItemIds(new Set());
    }
  }, []);

  const handleSoftDelete = useCallback(async (item: MediaItem) => {
    const mediaType = item.media_type === 'tv' || !item.title ? 'tv' : 'movie';
    setDeletedItemIds(prev => { const s = new Set(prev); s.add(item.id); return s; });
    try {
      const { error } = await supabase.from('deleted_items').insert({ tmdb_id: item.id, media_type: mediaType });
      if (error) console.warn('[soft-delete] DB error (item hidden locally regardless):', error.message);
    } catch (err) {
      console.warn('[soft-delete] Network error (item hidden locally regardless):', err);
    }
  }, []);

  // Filter out soft-deleted items from any list
  const filterDeleted = useCallback((items: MediaItem[]) =>
    deletedIdsArray.length === 0 ? items : items.filter(i => !deletedItemIds.has(i.id)),
    [deletedIdsArray, deletedItemIds]);

  // Wrap filterExplicitContent to also filter deleted items
  const filterContent = useCallback((items: MediaItem[]): MediaItem[] =>
    filterDeleted(filterExplicitContent(items)),
    [filterDeleted]);

  const top250Sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    applyPalette(getStoredPalette());
    const cine = getStoredCinematic();
    if (cine) { applyCinematic(cine); setCinematicTheme(cine); }
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Throttled scroll handler to avoid excessive re-renders
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setIsScrolled(window.scrollY > 50);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setRoute(path);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    if (route === '/admin') return;
    fetchDeletedItems();
    fetchAllData();
    fetchTop250Page(1, false);
    fetchCollections();
    fetchGenres();
    fetchTop250Tv(1, false);
  }, [route]);

  // Fetch genre lists from TMDB
  const fetchGenres = async () => {
    try {
      const [movGRes, tvGRes] = await Promise.all([
        corsFetchJson(`${BASE_URL}/genre/movie/list?api_key=${API_KEY}`),
        corsFetchJson(`${BASE_URL}/genre/tv/list?api_key=${API_KEY}`),
      ]);
      setMovieGenres(movGRes.genres || []);
      setTvGenres(tvGRes.genres || []);
    } catch { /* skip */ }
  };

  // ── Paginated browsing fetcher (movies, tv, or collection detail) ──
  const fetchBrowsePage = useCallback(async (
    page: number,
    type: 'movie' | 'tv',
    genres: number[],
    append: boolean
  ) => {
    setBrowseLoading(true);
    try {
      const genreParam = genres.length > 0 ? `&with_genres=${genres.join(',')}` : '';
      const sortParam = genres.length > 0 ? '&sort_by=popularity.desc' : '';
      const url = type === 'movie'
        ? `${BASE_URL}/discover/movie?api_key=${API_KEY}&include_adult=false&page=${page}${genreParam}${sortParam}`
        : `${BASE_URL}/discover/tv?api_key=${API_KEY}&include_adult=false&page=${page}${genreParam}&sort_by=popularity.desc`;
      const data = await corsFetchJson(url);
      const items: MediaItem[] = filterContent((data.results || []).filter((i: MediaItem) => i.poster_path));
      if (append) {
        setBrowseItems(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          return [...prev, ...items.filter(i => !existingIds.has(i.id))];
        });
      } else {
        setBrowseItems(items);
      }
      setBrowseHasMore(page < (data.total_pages || 1));
    } catch (err) {
      console.error('Browse fetch failed', err);
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  // ── Refs for filter values (avoids re-creating fetchBrowsePageFiltered on every filter change) ──
  const filterRef = useRef({ minRating, classicOnly, selectedLanguage, selectedCountry, selectedYear });
  filterRef.current = { minRating, classicOnly, selectedLanguage, selectedCountry, selectedYear };

  // ── Filtered browse fetcher (stable identity — reads filter values from ref) ──
  const fetchBrowsePageFiltered = useCallback(async (
    page: number,
    type: 'movie' | 'tv',
    genres: number[],
    append: boolean
  ) => {
    if (append) setBrowseLoadingMore(true); else setBrowseLoading(true);
    try {
      const f = filterRef.current;
      const parts: string[] = [`api_key=${API_KEY}`, `include_adult=false`, `page=${page}`];
      if (genres.length > 0) parts.push(`with_genres=${genres.join(',')}`);
      if (f.minRating > 0) parts.push(`vote_average.gte=${f.minRating}`);
      if (f.classicOnly) {
        if (type === 'movie') parts.push('primary_release_date.lte=1999-12-31');
        else parts.push('first_air_date.lte=1999-12-31');
      }
      if (f.selectedLanguage) parts.push(`with_original_language=${f.selectedLanguage}`);
      if (f.selectedCountry) parts.push(`with_origin_country=${f.selectedCountry}`);
      if (f.selectedYear) {
        if (type === 'movie') parts.push(`primary_release_year=${f.selectedYear}`);
        else parts.push(`first_air_date_year=${f.selectedYear}`);
      }
      parts.push('sort_by=popularity.desc');
      const url = `${BASE_URL}/discover/${type}?${parts.join('&')}`;
      const data = await corsFetchJson(url);
      const items: MediaItem[] = filterContent((data.results || []).filter((i: MediaItem) => i.poster_path));
      if (append) {
        setBrowseItems(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          return [...prev, ...items.filter(i => !existingIds.has(i.id))];
        });
      } else {
        setBrowseItems(items);
      }
      setBrowseHasMore(page < (data.total_pages || 1));
    } catch (err) {
      console.error('Filtered browse fetch failed', err);
    } finally {
      setBrowseLoading(false);
      setBrowseLoadingMore(false);
    }
  }, []);

  // ── Collection detail paginated fetch ──
  const fetchCollectionPage = useCallback(async (colId: string, page: number, append: boolean) => {
    const col = COLLECTIONS.find(c => c.id === colId);
    if (!col) return;
    if (append) setBrowseLoadingMore(true); else setBrowseLoading(true);
    try {
      const genreParam = col.genreIds.length > 0 ? `&with_genres=${col.genreIds.join(',')}` : '';
      const keywordParam = col.keywordId ? `&with_keywords=${col.keywordId}` : '';
      const data = await corsFetchJson(
        `${BASE_URL}/discover/movie?api_key=${API_KEY}&include_adult=false${genreParam}${keywordParam}&sort_by=popularity.desc&page=${page}`
      );
      const items: MediaItem[] = filterContent((data.results || []).filter((i: MediaItem) => i.poster_path));
      if (append) {
        setBrowseItems(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          return [...prev, ...items.filter(i => !existingIds.has(i.id))];
        });
      } else {
        setBrowseItems(items);
      }
      setBrowseHasMore(page < (data.total_pages || 1));
    } catch (err) {
      console.error('Collection fetch failed', err);
    } finally {
      setBrowseLoading(false);
      setBrowseLoadingMore(false);
    }
  }, []);

  // Initialize browse when switching to movies/tv/collection tab
  useEffect(() => {
    if (activeTab === 'movies') {
      setBrowseItems([]);
      setBrowsePage(1);
      setBrowseHasMore(true);
      setSelectedGenres([]);
      setClassicOnly(false);
      setMinRating(0);
      setSelectedLanguage('');
      setSelectedCountry('');
      setSelectedYear('');
      fetchBrowsePage(1, 'movie', [], false);
    } else if (activeTab === 'tv') {
      setBrowseItems([]);
      setBrowsePage(1);
      setBrowseHasMore(true);
      setSelectedGenres([]);
      setClassicOnly(false);
      setMinRating(0);
      setSelectedLanguage('');
      setSelectedCountry('');
      setSelectedYear('');
      fetchBrowsePage(1, 'tv', [], false);
    } else if (activeTab === 'collections' && activeCollection && activeCollection !== 'top250-movies' && activeCollection !== 'top250-tv') {
      setBrowseItems([]);
      setBrowsePage(1);
      setBrowseHasMore(true);
      fetchCollectionPage(activeCollection, 1, false);
    } else if (activeTab === 'collections' && activeCollection === 'top250-tv') {
      setTop250TvPage(1);
      setTop250TvHasMore(true);
      fetchTop250Tv(1, false);
    } else if (activeTab === 'collections' && activeCollection === 'top250-movies') {
      setTop250Page(1);
      setTop250HasMore(true);
      fetchTop250Page(1, false);
    } else if (activeTab === 'top') {
      setTop250Page(1);
      setTop250HasMore(true);
      fetchTop250Page(1, false);
    }
  // fetchTop250Tv/fetchTop250Page omitted from deps — they have stable [] deps and are defined below this effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeCollection, fetchBrowsePage, fetchCollectionPage]);

  // ── Merged filter effect: debounced refetch when ANY filter changes ──
  // Single effect replaces the two separate effects that caused duplicate fetches.
  const filterKey = `${selectedGenres.join(',')}|${classicOnly}|${minRating}|${selectedLanguage}|${selectedCountry}|${selectedYear}`;
  useEffect(() => {
    if (activeTab !== 'movies' && activeTab !== 'tv') return;
    setBrowseItems([]);
    setBrowsePage(1);
    setBrowseHasMore(true);
    const timer = setTimeout(() => {
      fetchBrowsePageFiltered(1, activeTab === 'movies' ? 'movie' : 'tv', selectedGenres, false);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Infinite scroll for browse
  useEffect(() => {
    if (activeTab !== 'movies' && activeTab !== 'tv' && !(activeTab === 'collections' && activeCollection && activeCollection !== 'top250-movies' && activeCollection !== 'top250-tv')) return;
    const sentinel = browseSentinel.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !browseLoadingMore && !browseLoading && browseHasMore) {
          const nextPage = browsePage + 1;
          setBrowsePage(nextPage);
          if (activeTab === 'collections' && activeCollection) {
            fetchCollectionPage(activeCollection, nextPage, true);
          } else {
            fetchBrowsePageFiltered(nextPage, activeTab === 'movies' ? 'movie' : 'tv', selectedGenres, true);
          }
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab, activeCollection, browsePage, browseLoading, browseLoadingMore, browseHasMore, fetchBrowsePage, fetchCollectionPage, fetchBrowsePageFiltered]);

  // Search in navbar (desktop instant dropdown)
  useEffect(() => {
    if (searchQuery.length <= 2) {
      setSearchResults([]);
      setSearchDropdownOpen(false);
      setSearchLoading(false);
      setActiveSearchIndex(-1);
      return;
    }
    setSearchDropdownOpen(true);
    setSearchLoading(true);
    setActiveSearchIndex(-1);
    const timer = setTimeout(() => {
      corsFetchJson(`${BASE_URL}/search/multi?api_key=${API_KEY}&include_adult=false&query=${encodeURIComponent(searchQuery)}`)
        .then(data => {
          setSearchResults(filterContent((data?.results || []).filter((i: MediaItem) => i.poster_path)).slice(0, 8));
          setSearchLoading(false);
        })
        .catch(err => { console.error(err); setSearchResults([]); setSearchLoading(false); });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search page (mobile dedicated search)
  useEffect(() => {
    if (searchPageInput.length <= 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      corsFetchJson(`${BASE_URL}/search/multi?api_key=${API_KEY}&include_adult=false&query=${encodeURIComponent(searchPageInput)}`)
        .then(data => {
          setSearchResults(filterContent((data?.results || []).filter((i: MediaItem) => i.poster_path)).slice(0, 24));
          setSearchLoading(false);
        })
        .catch(err => { console.error(err); setSearchResults([]); setSearchLoading(false); });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchPageInput]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!searchDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target as Node)) {
        setSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [searchDropdownOpen]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!searchDropdownOpen || searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSearchIndex(prev => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSearchIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && activeSearchIndex >= 0 && activeSearchIndex < searchResults.length) {
      e.preventDefault();
      setSelectedItem(searchResults[activeSearchIndex]);
      setSearchDropdownOpen(false);
      setSearchQuery('');
    } else if (e.key === 'Escape') {
      setSearchDropdownOpen(false);
    }
  };

  const fetchAllData = async () => {
    try {
      const [movRes, tvRes, topRes, trendingRes, animRes, actWarRes, nowRes, recRes] = await Promise.all([
        corsFetchJson(`${BASE_URL}/movie/popular?api_key=${API_KEY}&include_adult=false`),
        corsFetchJson(`${BASE_URL}/tv/popular?api_key=${API_KEY}&include_adult=false`),
        corsFetchJson(`${BASE_URL}/movie/top_rated?api_key=${API_KEY}&include_adult=false&page=1`),
        corsFetchJson(`${BASE_URL}/trending/all/week?api_key=${API_KEY}&include_adult=false`),
        corsFetchJson(`${BASE_URL}/discover/movie?api_key=${API_KEY}&include_adult=false&with_genres=16&sort_by=popularity.desc`),
        corsFetchJson(`${BASE_URL}/discover/movie?api_key=${API_KEY}&include_adult=false&with_genres=28,10752&sort_by=popularity.desc`),
        corsFetchJson(`${BASE_URL}/movie/now_playing?api_key=${API_KEY}&include_adult=false`),
        corsFetchJson(`${BASE_URL}/movie/top_rated?api_key=${API_KEY}&include_adult=false&page=2`),
      ]);
      setPopularMovies(filterContent(movRes.results || []));
      setPopularTv(filterContent(tvRes.results || []));
      setTopRated(filterContent(topRes.results || []).sort((a: MediaItem, b: MediaItem) => (b.vote_average || 0) - (a.vote_average || 0)));
      setTrending(filterContent((trendingRes.results || []).filter((i: MediaItem) => i.backdrop_path)).slice(0, 5));
      setAnime(filterContent((animRes.results || []).filter((i: MediaItem) => i.poster_path)).slice(0, 20));
      setActionWar(filterContent((actWarRes.results || []).filter((i: MediaItem) => i.poster_path)).slice(0, 20));
      setRecentlyAdded(filterContent((nowRes.results || []).filter((i: MediaItem) => i.poster_path)).slice(0, 20));
      setRecommended(filterContent((recRes.results || []).filter((i: MediaItem) => i.poster_path)).slice(0, 20));
    } catch (error) {
      console.error(error);
    }
  };

  // Fetch genre-based collections data (preview counts)
  const fetchCollections = async () => {
    const results: Record<string, MediaItem[]> = {};
    for (const col of COLLECTIONS) {
      try {
        const genreParam = col.genreIds.length > 0 ? `&with_genres=${col.genreIds.join(',')}` : '';
        const keywordParam = col.keywordId ? `&with_keywords=${col.keywordId}` : '';
        const data = await corsFetchJson(
          `${BASE_URL}/discover/movie?api_key=${API_KEY}&include_adult=false${genreParam}${keywordParam}&sort_by=popularity.desc`
        );
        results[col.id] = filterContent((data.results || []).filter((i: MediaItem) => i.poster_path)).slice(0, 20);
      } catch { /* skip */ }
    }
    setCollectionData(results);
  };

  // ── Top 250 Movies: TMDB movie/top_rated, sorted by vote_average.desc, min 3000 votes ──
  const [top250Page, setTop250Page] = useState(1);
  const [top250HasMore, setTop250HasMore] = useState(true);

  const fetchTop250Page = useCallback(async (page: number, append: boolean) => {
    if (append) setTop250LoadingMore(true); else setTop250Loading(true);
    try {
      const data = await corsFetchJson(
        `${BASE_URL}/movie/top_rated?api_key=${API_KEY}&include_adult=false&page=${page}&vote_count.gte=3000&sort_by=vote_average.desc`
      );
      const items: MediaItem[] = (data.results || [])
        .filter((i: MediaItem) => i.poster_path)
        .sort((a: MediaItem, b: MediaItem) => (b.vote_average || 0) - (a.vote_average || 0));
      if (append) {
        setTop250(prev => {
          const ids = new Set(prev.map(m => m.id));
          return [...prev, ...items.filter(i => !ids.has(i.id))];
        });
      } else {
        setTop250(items);
      }
      setTop250HasMore(page < (data.total_pages || 1) && page < 13);
    } catch (err) {
      console.error('Failed to load top 250 movies', err);
    } finally {
      setTop250Loading(false);
      setTop250LoadingMore(false);
    }
  }, []);

  // ── Top 250 TV: TMDB tv/top_rated, sorted by vote_average.desc, min 3000 votes ──
  const fetchTop250Tv = useCallback(async (page: number, append: boolean) => {
    if (append) setTop250TvLoadingMore(true); else setTop250TvLoading(true);
    try {
      const data = await corsFetchJson(
        `${BASE_URL}/tv/top_rated?api_key=${API_KEY}&include_adult=false&page=${page}&vote_count.gte=3000&sort_by=vote_average.desc`
      );
      const items: MediaItem[] = (data.results || [])
        .filter((i: MediaItem) => i.poster_path)
        .sort((a: MediaItem, b: MediaItem) => (b.vote_average || 0) - (a.vote_average || 0));
      if (append) {
        setTop250Tv(prev => {
          const ids = new Set(prev.map(m => m.id));
          return [...prev, ...items.filter(i => !ids.has(i.id))];
        });
      } else {
        setTop250Tv(items);
      }
      setTop250TvHasMore(page < (data.total_pages || 1) && page < 13);
    } catch (err) {
      console.error('Failed to load top 250 TV', err);
    } finally {
      setTop250TvLoading(false);
      setTop250TvLoadingMore(false);
    }
  }, []);

  // Infinite scroll for Top 250 TV (collections sub-page)
  useEffect(() => {
    if (activeTab !== 'collections' || activeCollection !== 'top250-tv') return;
    const sentinel = top250TvSentinel.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !top250TvLoadingMore && !top250TvLoading && top250TvHasMore) {
          const next = top250TvPage + 1;
          setTop250TvPage(next);
          fetchTop250Tv(next, true);
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab, activeCollection, top250TvPage, top250TvLoading, top250TvLoadingMore, top250TvHasMore, fetchTop250Tv]);

  // Load more Top 250 Movies on scroll (collections sub-page + top tab)
  useEffect(() => {
    if (activeTab !== 'collections' && activeTab !== 'top') return;
    if (activeTab === 'collections' && activeCollection !== 'top250-movies') return;
    const sentinel = top250Sentinel.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !top250LoadingMore && !top250Loading && top250HasMore) {
          const next = top250Page + 1;
          setTop250Page(next);
          fetchTop250Page(next, true);
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab, activeCollection, top250Page, top250Loading, top250LoadingMore, top250HasMore, fetchTop250Page]);

  if (route === '/admin') {
    return (
      <ErrorBoundary key="admin-route">
        <AdminDashboard />
      </ErrorBoundary>
    );
  }

  const goAdmin = () => navigateTo('/admin');

  const switchTab = (tab: string) => {
    setActiveTab(tab);
    setSearchQuery('');
    setSearchPageInput('');
    setActiveCollection(null);
    setSelectedGenres([]);
    setShowGenreFilter(false);
    setShowLangFilter(false);
    setShowCountryFilter(false);
    setShowRatingFilter(false);
    setShowYearFilter(false);
    setSelectedYear('');
    window.scrollTo(0, 0);
  };

  const toggleGenre = (genreId: number) => {
    setSelectedGenres(prev =>
      prev.includes(genreId) ? prev.filter(g => g !== genreId) : [...prev, genreId]
    );
  };

  // ── Shared card context (stable identity via useMemo so memoized cards don't remount) ──
  const cardProps: CardContextProps = useMemo(() => ({
    isAdmin,
    onDelete: handleSoftDelete,
    onSelect: setSelectedItem,
    isInList,
    toggleList,
    onRequireAuth: () => setAuthModalOpen(true),
    hasUser: !!user,
  }), [isAdmin, handleSoftDelete, isInList, toggleList, user]);

  // ── Genre Filter Component (modernized with Year, horizontal scroll, active chips) ──
  const GenreFilter = ({ genres, type }: { genres: Genre[]; type: 'movie' | 'tv' }) => {
    const displayGenres = type === 'movie' ? genres : genres.filter(g => genreMap[g.id] || g.name);
    const activeFilterCount = selectedGenres.length + (classicOnly ? 1 : 0) + (minRating > 0 ? 1 : 0) + (selectedLanguage ? 1 : 0) + (selectedCountry ? 1 : 0) + (selectedYear ? 1 : 0);

    // Close all dropdowns helper
    const closeAllDropdowns = () => {
      setShowGenreFilter(false);
      setShowRatingFilter(false);
      setShowLangFilter(false);
      setShowCountryFilter(false);
      setShowYearFilter(false);
    };

    const toggleDropdown = (which: 'genre' | 'rating' | 'lang' | 'country' | 'year') => {
      const isOpen = which === 'genre' ? showGenreFilter
        : which === 'rating' ? showRatingFilter
        : which === 'lang' ? showLangFilter
        : which === 'country' ? showCountryFilter
        : showYearFilter;
      closeAllDropdowns();
      if (!isOpen) {
        if (which === 'genre') setShowGenreFilter(true);
        else if (which === 'rating') setShowRatingFilter(true);
        else if (which === 'lang') setShowLangFilter(true);
        else if (which === 'country') setShowCountryFilter(true);
        else setShowYearFilter(true);
      }
    };

    // Active filter chips data
    const activeChips: { label: string; onRemove: () => void }[] = [];
    selectedGenres.forEach(gid => {
      const g = displayGenres.find(x => x.id === gid);
      if (g) activeChips.push({ label: genreMap[g.id] || g.name, onRemove: () => toggleGenre(gid) });
    });
    if (classicOnly) activeChips.push({ label: 'کلاسیک', onRemove: () => setClassicOnly(false) });
    if (minRating > 0) activeChips.push({ label: `${minRating.toFixed(1)}+`, onRemove: () => setMinRating(0) });
    if (selectedLanguage) activeChips.push({ label: LANGUAGES.find(l => l.code === selectedLanguage)?.label || 'زمان', onRemove: () => setSelectedLanguage('') });
    if (selectedCountry) activeChips.push({ label: COUNTRIES.find(c => c.code === selectedCountry)?.label || 'وڵات', onRemove: () => setSelectedCountry('') });
    if (selectedYear) activeChips.push({ label: String(selectedYear), onRemove: () => setSelectedYear('') });

    const activeStyle = { background: 'rgba(var(--accent-rgb), 0.15)', borderColor: 'rgba(var(--accent-rgb), 0.3)' };

    return (
      <div className="mb-5">
        {/* Filter buttons row — horizontal scroll on mobile, wrap on desktop */}
        <div className="flex lg:flex-wrap gap-2 lg:gap-2.5 overflow-x-auto lg:overflow-visible scrollbar-hide pb-1 lg:pb-0 -mx-2 px-2 lg:mx-0 lg:px-0">
          <button
            onClick={() => toggleDropdown('genre')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border transition-all whitespace-nowrap flex-shrink-0 ${
              showGenreFilter || selectedGenres.length > 0 || classicOnly ? 'text-white' : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
            }`}
            style={(showGenreFilter || selectedGenres.length > 0 || classicOnly) ? activeStyle : undefined}
          >
            <Filter className="w-4 h-4 accent-text" />
            فلتەرەکان
            {(selectedGenres.length + (classicOnly ? 1 : 0)) > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs accent-text" style={{ background: 'rgba(var(--accent-rgb), 0.2)' }}>
                {selectedGenres.length + (classicOnly ? 1 : 0)}
              </span>
            )}
          </button>

          <button
            onClick={() => toggleDropdown('year')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border transition-all whitespace-nowrap flex-shrink-0 ${
              showYearFilter || selectedYear ? 'text-white' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/90'
            }`}
            style={(showYearFilter || selectedYear) ? activeStyle : undefined}
          >
            <Calendar className="w-4 h-4 accent-text" />
            {selectedYear ? String(selectedYear) : 'ساڵ'}
          </button>

          <button
            onClick={() => toggleDropdown('rating')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border transition-all whitespace-nowrap flex-shrink-0 ${
              showRatingFilter || minRating > 0 ? 'text-white' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/90'
            }`}
            style={(showRatingFilter || minRating > 0) ? activeStyle : undefined}
          >
            <Star className="w-4 h-4 accent-text" />
            {minRating > 0 ? `${minRating.toFixed(1)}+` : 'پلە'}
          </button>

          <button
            onClick={() => toggleDropdown('lang')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border transition-all whitespace-nowrap flex-shrink-0 ${
              showLangFilter || selectedLanguage ? 'text-white' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/90'
            }`}
            style={(showLangFilter || selectedLanguage) ? activeStyle : undefined}
          >
            <Languages className="w-4 h-4 accent-text" />
            {selectedLanguage ? LANGUAGES.find(l => l.code === selectedLanguage)?.label || 'زمان' : 'زمان'}
          </button>

          <button
            onClick={() => toggleDropdown('country')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border transition-all whitespace-nowrap flex-shrink-0 ${
              showCountryFilter || selectedCountry ? 'text-white' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/90'
            }`}
            style={(showCountryFilter || selectedCountry) ? activeStyle : undefined}
          >
            <MapPin className="w-4 h-4 accent-text" />
            {selectedCountry ? COUNTRIES.find(c => c.code === selectedCountry)?.label || 'وڵات' : 'وڵات'}
          </button>

          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                setSelectedGenres([]); setClassicOnly(false); setMinRating(0);
                setSelectedLanguage(''); setSelectedCountry(''); setSelectedYear('');
              }}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-bold text-sm border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all whitespace-nowrap flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              پاککردنەوە
            </button>
          )}
        </div>

        {/* ── Dropdown panels (only one open at a time) ── */}

        {/* Genre + Classic dropdown */}
        <AnimatePresence>
          {showGenreFilter && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mt-3"
            >
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4 accent-text" />
                  <span className="text-sm font-bold text-white/80">جۆرەکان</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setClassicOnly(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      classicOnly ? 'text-white' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/90'
                    }`}
                    style={classicOnly ? activeStyle : undefined}
                  >
                    {classicOnly && <Check className="w-3 h-3" />}
                    <Clock3 className="w-3 h-3" />
                    کلاسیک (پێش ١٩٩٩)
                  </button>
                  <div className="w-full h-px bg-white/5 my-1" />
                  {displayGenres.map(g => {
                    const isSelected = selectedGenres.includes(g.id);
                    const label = genreMap[g.id] || g.name;
                    return (
                      <button
                        key={g.id}
                        onClick={() => toggleGenre(g.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          isSelected ? 'text-white' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/90'
                        }`}
                        style={isSelected ? activeStyle : undefined}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Year dropdown */}
        <AnimatePresence>
          {showYearFilter && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mt-3"
            >
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 max-h-64 overflow-y-auto">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 accent-text" />
                  <span className="text-sm font-bold text-white/80">ساڵی بەرهەمهێنان</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  <button
                    onClick={() => { setSelectedYear(''); setShowYearFilter(false); }}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${!selectedYear ? 'text-white' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}
                    style={!selectedYear ? activeStyle : undefined}
                  >
                    هەموو
                  </button>
                  {YEAR_OPTIONS.map(y => (
                    <button
                      key={y}
                      onClick={() => { setSelectedYear(y); setShowYearFilter(false); }}
                      className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${selectedYear === y ? 'text-white' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}
                      style={selectedYear === y ? activeStyle : undefined}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rating slider panel */}
        <AnimatePresence>
          {showRatingFilter && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mt-3"
            >
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <span className="text-white/50 text-xs font-bold whitespace-nowrap">کەمترین پلە:</span>
                  <input
                    type="range" min={0} max={10} step={0.5}
                    value={minRating}
                    onChange={(e) => setMinRating(parseFloat(e.target.value))}
                    dir="ltr"
                    className="flex-1 accent-amber-500 cursor-pointer"
                  />
                  <span className="text-white font-bold text-sm w-10 text-center" style={{ color: 'var(--accent-bright)' }}>{minRating.toFixed(1)}</span>
                  {minRating > 0 && (
                    <button onClick={() => setMinRating(0)} className="text-white/40 hover:text-white text-xs font-bold">سفر</button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Language dropdown panel */}
        <AnimatePresence>
          {showLangFilter && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mt-3"
            >
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => { setSelectedLanguage(lang.code); setShowLangFilter(false); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        selectedLanguage === lang.code ? 'text-white' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/90'
                      }`}
                      style={selectedLanguage === lang.code ? activeStyle : undefined}
                    >
                      {selectedLanguage === lang.code && <Check className="w-3 h-3" />}
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Country dropdown panel */}
        <AnimatePresence>
          {showCountryFilter && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mt-3"
            >
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex flex-wrap gap-2">
                  {COUNTRIES.map(country => (
                    <button
                      key={country.code}
                      onClick={() => { setSelectedCountry(country.code); setShowCountryFilter(false); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        selectedCountry === country.code ? 'text-white' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/90'
                      }`}
                      style={selectedCountry === country.code ? activeStyle : undefined}
                    >
                      {selectedCountry === country.code && <Check className="w-3 h-3" />}
                      {country.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Active Filter Chips ── */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {activeChips.map((chip, i) => (
              <button
                key={i}
                onClick={chip.onRemove}
                className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white border transition-all hover:bg-red-500/20 hover:border-red-500/40"
                style={{ background: 'rgba(var(--accent-rgb), 0.12)', borderColor: 'rgba(var(--accent-rgb), 0.25)' }}
              >
                {chip.label}
                <X className="w-3 h-3 text-white/40 group-hover:text-red-400 transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // All movies for AI bot to search
  const allMovies: MediaItem[] = [...popularMovies, ...popularTv, ...topRated, ...recommended, ...anime, ...actionWar, ...recentlyAdded];
  const dedupedMovies = allMovies.filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i);

  const bottomNavItems = [
    { key: 'home', label: 'سەرەکی', icon: HomeIcon },
    { key: 'search', label: 'گەڕان', icon: Search },
    { key: 'movies', label: 'فیلم', icon: Film },
    { key: 'tv', label: 'زنجیرە', icon: Tv },
    { key: 'collections', label: 'کۆکراوە', icon: LayoutGrid },
  ];

  return (
    <div dir="rtl" className="min-h-screen text-white font-vazirmatn relative overflow-x-hidden bg-[#08080a]">
      {/* Cinematic particle effects layer */}
      <CinematicParticles theme={cinematicTheme} />
      {/* Fixed background gradient to prevent black flash during scroll */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-[#08080a] via-[#0d0e12] to-[#12131a]" />
      <div className="fixed top-[-10%] right-[-5%] w-[40vw] h-[40vw] rounded-full blur-[120px] pointer-events-none -z-10" style={{ background: 'rgba(var(--accent-rgb), 0.08)' }}></div>
      <div className="fixed bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] pointer-events-none -z-10" style={{ background: 'rgba(var(--accent-rgb), 0.1)' }}></div>

      {/* Navbar */}
      <nav className={`sticky top-0 z-40 transition-colors duration-300 ${isScrolled ? 'bg-[#08080a]/95 backdrop-blur-xl border-b shadow-2xl' : 'bg-gradient-to-b from-black/70 to-transparent border-b border-transparent'}`} style={isScrolled ? { borderColor: 'rgba(var(--accent-rgb), 0.1)' } : undefined}>
        <div className="container mx-auto px-4 lg:px-8">
          <div className={`flex items-center justify-between gap-3 transition-all duration-300 ${isScrolled ? 'h-14' : 'h-16'}`}>
            {/* Logo */}
            <h1 onClick={() => switchTab('home')} className="flex items-center gap-2 cursor-pointer tracking-tight whitespace-nowrap flex-shrink-0">
              <div className="w-9 h-9 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center text-black font-black text-base lg:text-lg flex-shrink-0" style={{ background: 'linear-gradient(to bottom right, var(--accent-base), var(--accent-deep))', boxShadow: '0 0 15px rgba(var(--accent-rgb), 0.4)' }}>KS</div>
              <span className="flex flex-col leading-tight">
                <span className="text-lg lg:text-2xl font-black" style={{ background: 'linear-gradient(to left, var(--accent-bright), var(--accent-deep))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>کورد ستریم</span>
                <span className="text-[9px] text-white/40 font-medium tracking-wide hidden sm:inline">Kurd Stream</span>
              </span>
            </h1>

            {/* Desktop nav tabs */}
            <div className="hidden lg:flex gap-5 text-white/80 font-semibold text-sm flex-shrink-0">
              {[
                { key: 'home', label: 'سەرەکی', icon: HomeIcon },
                { key: 'movies', label: 'فیلمەکان', icon: Film },
                { key: 'tv', label: 'زنجیرەکان', icon: Tv },
                { key: 'top', label: 'باشترینەکان', icon: Trophy },
                { key: 'collections', label: 'کۆکراوەکان', icon: LayoutGrid },
              ].map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => switchTab(key)} className={`hover:opacity-100 transition flex items-center gap-1.5 ${activeTab === key ? 'accent-text font-bold' : 'text-white/80'}`}>
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>

            {/* Search bar (desktop only, inline) — explicit text-white for visibility */}
            <div ref={searchDropdownRef} className="relative group hidden md:block flex-1 max-w-md">
              <div className="absolute inset-0 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 blur-md -z-10" style={{ background: 'rgba(var(--accent-rgb), 0.15)' }} />
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 group-focus-within:accent-text transition-colors duration-200 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                dir="auto"
                placeholder="گەڕان بۆ فیلم یان زنجیرە..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { if (searchQuery.length > 2) setSearchDropdownOpen(true); }}
                onKeyDown={handleSearchKeyDown}
                className="w-full bg-[#1a1b20] border border-white/15 text-white caret-amber-400 rounded-2xl py-2.5 pl-4 pr-12 focus:outline-none transition-all duration-300 backdrop-blur-md placeholder-white/40 text-sm focus:bg-[#222328] focus:border-[color:var(--accent-base)] font-medium"
                style={{ color: '#fbbf24' }}
              />
              {searchLoading && <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-white/40" />}
              {!searchLoading && searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchDropdownOpen(false); searchInputRef.current?.focus(); }} className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-all">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Instant results dropdown */}
              <AnimatePresence>
                {searchDropdownOpen && searchQuery.length > 2 && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full mt-2 left-0 right-0 bg-[#0d0e12]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
                    style={{ borderColor: 'rgba(var(--accent-rgb), 0.15)' }}
                  >
                    {searchLoading && searchResults.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-white/50 text-sm">
                        <Loader2 className="w-5 h-5 animate-spin accent-text" />
                        <span>گەڕان...</span>
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Search className="w-8 h-8 text-white/20 mb-2" />
                        <p className="text-white/50 text-sm">هیچ بەرهەمێک نەدۆزراوە</p>
                        <p className="text-white/30 text-xs mt-1">هەوڵبدە بە ناوێکی تر</p>
                      </div>
                    ) : (
                      <div className="max-h-[420px] overflow-y-auto py-2">
                        {searchResults.map((item, idx) => {
                          const isTv = item.media_type === 'tv' || !item.title;
                          const title = item.title || item.name || '';
                          const year = (item.release_date || item.first_air_date)?.substring(0, 4);
                          return (
                            <button key={`${item.id}-${idx}`} onClick={() => { setSelectedItem(item); setSearchDropdownOpen(false); setSearchQuery(''); }} onMouseEnter={() => setActiveSearchIndex(idx)} className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all text-right ${activeSearchIndex === idx ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                              <div className="w-10 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                                {item.poster_path ? <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt={title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film className="w-5 h-5 text-white/20" /></div>}
                              </div>
                              <div className="flex-1 min-w-0 text-right">
                                <p className="font-bold text-sm text-white truncate" dir="auto">{title}</p>
                                <div className="flex items-center gap-2 mt-0.5 text-xs">
                                  <span className="flex items-center gap-1 accent-text font-semibold"><Star className="w-3 h-3 fill-current accent-fill" />{item.vote_average?.toFixed(1)}</span>
                                  {year && <span className="text-white/50" dir="ltr">{year}</span>}
                                  <span className="text-white/30">•</span>
                                  <span className="text-white/50 flex items-center gap-1">{isTv ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}{isTv ? 'زنجیرە' : 'فیلم'}</span>
                                </div>
                              </div>
                              <Play className="w-5 h-5 text-white/20 flex-shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Theme picker in navbar */}
            <AccentPicker />

            {/* AI Bot button */}
            <button onClick={() => setAiBotOpen(true)} className="hidden md:flex items-center gap-2 px-3 lg:px-4 py-2 lg:py-2.5 rounded-2xl text-black font-bold text-sm transition-all hover:scale-105 flex-shrink-0" style={{ background: 'linear-gradient(135deg, var(--accent-base), var(--accent-deep))', boxShadow: '0 0 15px rgba(var(--accent-rgb), 0.3)' }}>
              <Bot className="w-4 h-4" />
              <span className="hidden lg:inline">دۆزەرەوەی فیلم</span>
              <Sparkles className="w-3.5 h-3.5" />
            </button>

            {/* Auth / Profile button */}
            {user ? (
              <button onClick={() => setProfileOpen(true)} className="flex items-center gap-2 flex-shrink-0 bg-white/5 border border-white/10 rounded-2xl py-1.5 lg:py-2 px-2.5 lg:px-3 hover:bg-white/10 transition-all">
                {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-7 h-7 lg:w-8 lg:h-8 rounded-full object-cover" /> : <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-black font-black text-xs lg:text-sm" style={{ background: 'linear-gradient(135deg, var(--accent-base), var(--accent-deep))' }}>{(profile?.username || '؟')[0]}</div>}
                <span className="hidden lg:inline text-white/80 text-sm font-bold max-w-[80px] truncate">{profile?.username || 'هەژمار'}</span>
              </button>
            ) : (
              <button onClick={() => setAuthModalOpen(true)} className="flex items-center gap-2 flex-shrink-0 bg-white/5 border border-white/10 rounded-2xl py-2 lg:py-2.5 px-3 lg:px-4 hover:bg-white/10 transition-all text-sm font-bold text-white/80">
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">چوونەژوورەوە</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content — no AnimatePresence to prevent black flash during scroll */}
      <main className="container mx-auto px-4 lg:px-8 mt-6 lg:mt-8 overflow-x-hidden max-w-[100vw] pb-24 lg:pb-8">
        <div>
            {/* ── Search Page (mobile) ── */}
            {activeTab === 'search' ? (
              <div className="max-w-3xl mx-auto">
                <div className="relative mb-6">
                  <Search className="absolute right-5 top-1/2 -translate-y-1/2 w-6 h-6 text-white/40 pointer-events-none" />
                  <input
                    type="text" dir="auto" autoFocus
                    placeholder="گەڕان بۆ فیلم یان زنجیرە..."
                    value={searchPageInput}
                    onChange={(e) => setSearchPageInput(e.target.value)}
                    className="w-full bg-[#1a1b20] border border-white/15 text-white caret-amber-400 rounded-3xl py-4 pl-5 pr-14 focus:outline-none transition-all duration-300 backdrop-blur-md placeholder-white/40 text-lg focus:bg-[#222328] focus:border-[color:var(--accent-base)] font-medium"
                    style={{ color: '#fbbf24' }}
                  />
                  {searchLoading && <Loader2 className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin accent-text" />}
                  {searchPageInput && !searchLoading && (
                    <button onClick={() => setSearchPageInput('')} className="absolute left-5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-all">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {searchPageInput.length <= 2 ? (
                  <div>
                    <p className="text-white/40 text-sm font-bold mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 accent-text" /> پێشنیاری گەڕان</p>
                    <div className="flex flex-wrap gap-2 mb-8">
                      {['ئەکشن', 'کۆمیدی', 'ترسناک', 'خەیاڵی زانستی', 'ئەنیمێ', 'دراما', 'تاوانکاری', 'مارڤل'].map(s => (
                        <button key={s} onClick={() => setSearchPageInput(s)} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-bold hover:bg-white/10 hover:accent-text transition-all">{s}</button>
                      ))}
                    </div>
                    <p className="text-white/40 text-sm font-bold mb-4 flex items-center gap-2"><Flame className="w-4 h-4 accent-text" /> پڕبینەرترینەکان</p>
                    <PosterGrid data={[...popularMovies, ...popularTv].slice(0, 18)} cardProps={cardProps} />
                  </div>
                ) : searchResults.length === 0 && !searchLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4"><Search className="w-8 h-8 text-white/30" /></div>
                    <p className="text-white/50 text-lg">هیچ بەرهەمێک نەدۆزراوە</p>
                    <p className="text-white/30 text-sm mt-1">هەوڵبدە بە ناوێکی تر</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-white/50 text-sm mb-4" dir="auto">{searchResults.length} ئەنجام بۆ "{searchPageInput}"</p>
                    <PosterGrid data={searchResults} cardProps={cardProps} />
                  </div>
                )}
              </div>
            ) : activeTab === 'top' ? (
              /* ── Dedicated Top 250 Page ── */
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <Trophy className="w-7 h-7 lg:w-8 lg:h-8 accent-text" />
                  <h2 className="text-2xl lg:text-3xl font-black text-white">باشترین ٢٥٠ فیلم</h2>
                  <span className="text-white/40 text-sm font-medium">IMDb Top 250</span>
                </div>
                <PosterGrid data={top250} showRank cardProps={cardProps} />
                <div ref={top250Sentinel} className="flex items-center justify-center py-12">
                  {top250LoadingMore && <div className="flex items-center gap-2 accent-text text-sm font-bold"><Loader2 className="w-5 h-5 animate-spin" /> بارکردنی زیاتر...</div>}
                  {!top250Loading && !top250HasMore && <p className="text-white/40 text-sm">هەموو فیلمەکان پیشان دران</p>}
                </div>
              </div>
            ) : activeTab === 'movies' ? (
              /* ── Movies Page with genre filter + infinite scroll ── */
              <div>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl lg:text-2xl font-bold border-r-4 pr-3 flex items-center gap-2" style={{ borderColor: 'var(--accent-base)' }}>
                    <Film className="w-5 h-5 accent-text" /> فیلمەکان
                  </h2>
                </div>
                <GenreFilter genres={movieGenres} type="movie" />
                {browseItems.length === 0 && browseLoading ? (
                  <PosterSkeletonGrid count={14} />
                ) : browseItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Film className="w-12 h-12 text-white/20 mb-3" />
                    <p className="text-white/50">هیچ فیلمێک نەدۆزرایەوە بەم فلتەرە</p>
                  </div>
                ) : (
                  <>
                    <PosterGrid data={browseItems} cardProps={cardProps} />
                    <div ref={browseSentinel} className="flex items-center justify-center py-8">
                      {browseLoadingMore && <div className="flex items-center gap-2 accent-text text-sm font-bold"><Loader2 className="w-5 h-5 animate-spin" /> بارکردنی زیاتر...</div>}
                      {!browseLoading && !browseHasMore && browseItems.length > 0 && <p className="text-white/40 text-sm">هیچ فیلمی زیاتر نییە</p>}
                    </div>
                  </>
                )}
              </div>
            ) : activeTab === 'tv' ? (
              /* ── Series Page with genre filter + infinite scroll ── */
              <div>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl lg:text-2xl font-bold border-r-4 pr-3 flex items-center gap-2" style={{ borderColor: 'var(--accent-base)' }}>
                    <Tv className="w-5 h-5 accent-text" /> زنجیرەکان
                  </h2>
                </div>
                <GenreFilter genres={tvGenres} type="tv" />
                {browseItems.length === 0 && browseLoading ? (
                  <PosterSkeletonGrid count={14} />
                ) : browseItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Tv className="w-12 h-12 text-white/20 mb-3" />
                    <p className="text-white/50">هیچ زنجیرەیەک نەدۆزرایەوە بەم فلتەرە</p>
                  </div>
                ) : (
                  <>
                    <PosterGrid data={browseItems} cardProps={cardProps} />
                    <div ref={browseSentinel} className="flex items-center justify-center py-8">
                      {browseLoadingMore && <div className="flex items-center gap-2 accent-text text-sm font-bold"><Loader2 className="w-5 h-5 animate-spin" /> بارکردنی زیاتر...</div>}
                      {!browseLoading && !browseHasMore && browseItems.length > 0 && <p className="text-white/40 text-sm">هیچ زنجیرەی زیاتر نییە</p>}
                    </div>
                  </>
                )}
              </div>
            ) : activeTab === 'collections' ? (
              /* ── Collections Page ── */
              <div>
                {activeCollection === 'top250-movies' ? (
                  <div>
                    <button onClick={() => setActiveCollection(null)} className="flex items-center gap-2 text-white/60 hover:text-white text-sm font-bold mb-5 transition">
                      <ChevronRight className="w-5 h-5" /> گەڕانەوە بۆ کۆکراوەکان
                    </button>
                    <h2 className="text-2xl font-black text-white mb-5 flex items-center gap-2"><TrophyIcon className="w-6 h-6 accent-text" /> IMDb Top 250 Movies</h2>
                    <PosterGrid data={top250} showRank cardProps={cardProps} />
                    <div ref={top250Sentinel} className="flex items-center justify-center py-12">
                      {top250LoadingMore && <div className="flex items-center gap-2 accent-text text-sm font-bold"><Loader2 className="w-5 h-5 animate-spin" /> بارکردنی زیاتر...</div>}
                      {!top250Loading && !top250HasMore && <p className="text-white/40 text-sm">هەموو فیلمەکان پیشان دران</p>}
                    </div>
                  </div>
                ) : activeCollection === 'top250-tv' ? (
                  <div>
                    <button onClick={() => setActiveCollection(null)} className="flex items-center gap-2 text-white/60 hover:text-white text-sm font-bold mb-5 transition">
                      <ChevronRight className="w-5 h-5" /> گەڕانەوە بۆ کۆکراوەکان
                    </button>
                    <h2 className="text-2xl font-black text-white mb-5 flex items-center gap-2"><TrophyIcon className="w-6 h-6 accent-text" /> IMDb Top 250 Series</h2>
                    <PosterGrid data={top250Tv} cardProps={cardProps} />
                    <div ref={top250TvSentinel} className="flex items-center justify-center py-12">
                      {top250TvLoadingMore && <div className="flex items-center gap-2 accent-text text-sm font-bold"><Loader2 className="w-5 h-5 animate-spin" /> بارکردنی زیاتر...</div>}
                      {!top250TvLoading && !top250TvHasMore && <p className="text-white/40 text-sm">هەموو زنجیرەکان پیشان دران</p>}
                    </div>
                  </div>
                ) : activeCollection ? (
                  <div>
                    <button onClick={() => setActiveCollection(null)} className="flex items-center gap-2 text-white/60 hover:text-white text-sm font-bold mb-5 transition">
                      <ChevronRight className="w-5 h-5" /> گەڕانەوە بۆ کۆکراوەکان
                    </button>
                    {(() => {
                      const col = COLLECTIONS.find(c => c.id === activeCollection);
                      if (!col) return null;
                      return <h2 className="text-2xl font-black text-white mb-5 flex items-center gap-2"><col.icon className="w-6 h-6 accent-text" /> {col.title}</h2>;
                    })()}
                    {browseItems.length === 0 && browseLoading ? (
                      <PosterSkeletonGrid count={14} />
                    ) : (
                      <>
                        <PosterGrid data={browseItems} cardProps={cardProps} />
                        <div ref={browseSentinel} className="flex items-center justify-center py-8">
                          {browseLoadingMore && <div className="flex items-center gap-2 accent-text text-sm font-bold"><Loader2 className="w-5 h-5 animate-spin" /> بارکردنی زیاتر...</div>}
                          {!browseLoading && !browseHasMore && browseItems.length > 0 && <p className="text-white/40 text-sm">هیچ فیلمی زیاتر نییە</p>}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-3 mb-6">
                      <LayoutGrid className="w-7 h-7 accent-text" />
                      <h2 className="text-2xl lg:text-3xl font-black text-white">کۆکراوەکان</h2>
                    </div>
                    {/* IMDb Top 250 featured cards at the very top */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                      <motion.button
                        initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                        onClick={() => setActiveCollection('top250-movies')}
                        className="group relative h-36 lg:h-44 rounded-2xl overflow-hidden border border-amber-500/20 hover:border-amber-500/50 transition-all hover:scale-[1.02]"
                        style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.03))' }}
                      >
                        <div className="absolute inset-0 flex items-center gap-4 p-5">
                          <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)' }}>
                            <TrophyIcon className="w-7 h-7 text-amber-400" />
                          </div>
                          <div className="text-right">
                            <p className="text-white font-black text-base lg:text-lg">IMDb Top 250 Movies</p>
                            <p className="text-white/40 text-xs mt-0.5">باشترین ٢٥٠ فیلمی جیهان</p>
                          </div>
                        </div>
                      </motion.button>
                      <motion.button
                        initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                        onClick={() => setActiveCollection('top250-tv')}
                        className="group relative h-36 lg:h-44 rounded-2xl overflow-hidden border border-cyan-500/20 hover:border-cyan-500/50 transition-all hover:scale-[1.02]"
                        style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(6,182,212,0.03))' }}
                      >
                        <div className="absolute inset-0 flex items-center gap-4 p-5">
                          <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(6,182,212,0.2)', border: '1px solid rgba(6,182,212,0.4)' }}>
                            <TrophyIcon className="w-7 h-7 text-cyan-400" />
                          </div>
                          <div className="text-right">
                            <p className="text-white font-black text-base lg:text-lg">IMDb Top 250 Series</p>
                            <p className="text-white/40 text-xs mt-0.5">باشترین ٢٥٠ زنجیرەی جیهان</p>
                          </div>
                        </div>
                      </motion.button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {COLLECTIONS.map((col, i) => (
                        <motion.button key={col.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => setActiveCollection(col.id)} className="group relative h-32 lg:h-40 rounded-2xl overflow-hidden border border-white/10 hover:border-white/30 transition-all hover:scale-[1.03]" style={{ background: `linear-gradient(135deg, ${col.color}20, ${col.color}08)` }}>
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ background: `${col.color}30`, border: `1px solid ${col.color}50` }}>
                              <col.icon className="w-6 h-6" style={{ color: col.color }} />
                            </div>
                            <span className="text-white font-bold text-sm lg:text-base">{col.title}</span>
                            <span className="text-white/40 text-xs">{(collectionData[col.id] || []).length}+ فیلم</span>
                          </div>
                        </motion.button>
                      ))}
                    </div>

                    {/* Admin button in Collections footer */}
                    <div className="mt-8 pt-6 border-t text-center" style={{ borderColor: 'rgba(var(--accent-rgb), 0.05)' }}>
                      <button
                        onClick={goAdmin}
                        className="text-white/30 hover:text-white/60 text-xs font-medium transition"
                      >
                        ئەدمین
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── Home Tab — no Top 250 carousel ── */
              <div className="space-y-8 lg:space-y-10">

                {trending.length > 0 && (
                  <div className="-mx-4 lg:-mx-8 -mt-6 lg:-mt-8 mb-2">
                    <HeroSlider items={trending} onSelect={setSelectedItem} />
                  </div>
                )}

                {/* Continue Watching */}
                {user && continueWatching.length > 0 && (
                  <div className="group/row">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-5 h-5 accent-text" />
                      <h2 className="text-base lg:text-xl font-bold border-r-4 pr-2.5" style={{ borderColor: 'var(--accent-base)' }}>بەردەوامبە لە سەیرکردن</h2>
                    </div>
                    <div className="flex gap-2.5 overflow-x-auto pb-3 snap-x scrollbar-hide -mx-2 px-2" style={{ scrollbarWidth: 'none' }}>
                      {continueWatching.map((wp: WatchProgressItem, index: number) => {
                        const pct = wp.duration > 0 ? (wp.resume_position / wp.duration) * 100 : 0;
                        return (
                          <div key={wp.id} onClick={() => setSelectedItem({ id: wp.tmdb_id, title: wp.media_type === 'movie' ? wp.title : undefined, name: wp.media_type === 'tv' ? wp.title : undefined, poster_path: wp.poster_path, backdrop_path: wp.backdrop_path || undefined, overview: '', media_type: wp.media_type })} className="group cursor-pointer rounded-xl overflow-hidden border border-white/5 bg-white/5 flex-shrink-0 w-[160px] lg:w-[200px] snap-start transition-all hover:scale-105">
                            <div className="relative aspect-video w-full overflow-hidden bg-white/5">
                              <img src={`https://image.tmdb.org/t/p/w300${wp.backdrop_path || wp.poster_path}`} alt={wp.title} loading="lazy" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end p-2.5">
                                <p className="text-white text-xs font-bold truncate">{wp.title}</p>
                                {wp.season_number && <p className="text-white/50 text-[10px]">وەرز {wp.season_number} - ئەڵقە {wp.episode_number}</p>}
                              </div>
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                <div className="p-2.5 rounded-full backdrop-blur-md" style={{ background: 'rgba(var(--accent-rgb), 0.8)' }}><Play className="w-5 h-5 text-black fill-black" /></div>
                              </div>
                            </div>
                            <div className="h-1 bg-white/10"><div className="h-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: 'var(--accent-base)' }} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mood Matchmaker — AI-powered mood-based discovery */}
                <MoodMatchmaker onSelectItem={setSelectedItem} />

                {/* Smart Recommendations based on watch history */}
                {user && continueWatching.length > 0 && recommended.length > 0 && (
                  <CarouselRow title="پێشنیاری زیرەک بۆ تۆ" icon={Sparkles} data={recommended.slice(0, 20)} cardProps={cardProps} />
                )}

                {/* Latest Movies */}
                <CarouselRow title="نوێترین فیلمەکان" icon={Flame} data={recentlyAdded.slice(0, 20)} cardProps={cardProps} />

                {/* Popular Movies */}
                <CarouselRow title="پڕبینەرترین فیلمەکان" icon={Film} data={popularMovies} onSeeAll={() => switchTab('movies')} cardProps={cardProps} />

                {/* Popular TV */}
                <CarouselRow title="پڕبینەرترین زنجیرەکان" icon={Tv} data={popularTv} onSeeAll={() => switchTab('tv')} cardProps={cardProps} />

                {/* Recommended */}
                <CarouselRow title="فیلمە پێشنیارکراوەکان" icon={Sparkles} data={recommended} onSeeAll={() => switchTab('top')} cardProps={cardProps} />

                {/* Anime */}
                <CarouselRow title="ئەنیمێ و ئەنیمەیشن" icon={Film} data={anime} onSeeAll={() => switchTab('collections')} cardProps={cardProps} />

                {/* Action & War */}
                <CarouselRow title="ئەکشن و جەنگی" icon={Flame} data={actionWar} onSeeAll={() => switchTab('collections')} cardProps={cardProps} />
              </div>
            )}
          </div>
      </main>

      {/* Bottom Navigation Bar — Mobile only */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#08080a]/95 backdrop-blur-xl border-t" style={{ borderColor: 'rgba(var(--accent-rgb), 0.1)' }}>
        <div className="flex items-center justify-around h-16 px-2">
          {bottomNavItems.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <button key={key} onClick={() => switchTab(key)} className={`flex flex-col items-center gap-0.5 px-2 py-1.5 transition-all ${isActive ? 'accent-text' : 'text-white/40'}`}>
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                <span className="text-[10px] font-bold">{label}</span>
                {isActive && <motion.div layoutId="bottomNavIndicator" className="absolute -top-px h-0.5 w-8 rounded-full" style={{ background: 'var(--accent-base)' }} />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* AI Bot FAB — positioned above bottom nav on mobile */}
      <button onClick={() => setAiBotOpen(true)} className="md:hidden fixed bottom-20 left-4 z-30 w-12 h-12 rounded-full flex items-center justify-center text-black shadow-2xl" style={{ background: 'linear-gradient(135deg, var(--accent-base), var(--accent-deep))', boxShadow: '0 0 20px rgba(var(--accent-rgb), 0.5)' }}>
        <Bot className="w-6 h-6" />
      </button>

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      <ProfilePage open={profileOpen} onClose={() => setProfileOpen(false)} onSelectItem={setSelectedItem} />
      <AIBot open={aiBotOpen} onClose={() => setAiBotOpen(false)} allMovies={dedupedMovies} onSelect={setSelectedItem} />

      <AnimatePresence>
        {selectedItem && (
          <VideoPlayer item={selectedItem} onClose={() => setSelectedItem(null)} onRequireAuth={() => setAuthModalOpen(true)} />
        )}
      </AnimatePresence>

      {/* Footer — hidden on mobile */}
      <footer className="hidden lg:block border-t mt-20 pt-12 pb-8" style={{ borderColor: 'rgba(var(--accent-rgb), 0.1)' }}>
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex flex-col lg:flex-row items-start justify-between gap-8 mb-8">
            <div className="max-w-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-black font-black" style={{ background: 'linear-gradient(to bottom right, var(--accent-base), var(--accent-deep))' }}>KS</div>
                <div>
                  <h3 className="text-xl font-black text-white">کورد ستریم</h3>
                  <p className="text-[10px] text-white/40 font-medium tracking-wide">Kurd Stream</p>
                </div>
              </div>
              <p className="text-white/40 text-xs leading-relaxed">ماڵپەڕێکی سینەمایی کوردی بۆ سەیرکردنی فیلم و زنجیرە بە ژێرنووسی کوردی سۆرانی. باشترین ٢٥٠ فیلمی IMDb و دۆزەرەوەی فیلم بە ژیریی دەستکرد.</p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-bold text-white/50">
              <a href="#" className="hover:opacity-80 transition accent-text">دەربارە</a>
              <a href="#" className="hover:opacity-80 transition accent-text">پەیوەندی</a>
              <a href="#" className="hover:opacity-80 transition accent-text">یاساکانی ماڵپەڕ</a>
              <a href="#" className="hover:opacity-80 transition accent-text">داواکردنی فیلم</a>
            </div>
            <div className="flex items-center gap-3">
              <AccentPicker />
            </div>
          </div>
          <div className="border-t pt-6" style={{ borderColor: 'rgba(var(--accent-rgb), 0.05)' }}>
            <p className="text-white/30 text-xs text-center">
              کورد ستریم | Kurd Stream — سینەمای کوردی © ٢٠٢٦{' '}
              <span
                onClick={goAdmin}
                className="cursor-pointer select-none inline-block w-1.5 h-1.5 rounded-full bg-white/10 hover:bg-white/40 transition-colors align-middle mx-1"
                title=""
                aria-hidden="true"
              />
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
