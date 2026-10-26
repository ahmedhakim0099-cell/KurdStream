import { useState, useEffect, useRef, useCallback } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  Search, Upload, Trash2, Edit3, X, Film, Tv, Subtitles, Link as LinkIcon,
  Lock, LogOut, Save, ArrowLeft, AlertCircle, CheckCircle, FileText, Sparkles, Video,
  Languages, Download, Key as KeyIcon, Clock, Star, Check, MessageSquare, User as UserIcon,
  Loader2, RotateCcw, Copy, CheckCheck, Eye, RefreshCw,
} from 'lucide-react';
import { corsFetchJson } from '@/lib/corsFetch';
import type { MediaItem, Subtitle } from '@/types';
import {
  fetchAllSubtitles, uploadSubtitle, updateSubtitle, deleteSubtitle,
  fetchVideoUrls, upsertVideoUrl, deleteVideoUrl, uploadSubtitleToStorage,
  subtitleStoragePath,
  type VideoUrl
} from '@/subtitleApi';
import VideoUpload from '@/components/VideoUpload';
import {
  translateWithGeminiClientSide,
  parseSubtitleBlocks,
  reassembleSubtitle,
  type SubtitleBlock,
  type TranslationPair,
} from '@/subtitleTranslator';
import ErrorBoundary from '@/components/ErrorBoundary';
import { supabase } from '@/lib/supabase';
import type { ReviewItem } from '@/lib/userData';
import { useAuth } from '@/lib/auth';

const API_KEY = '7d14dee38d0eb74c7fd96bec8dceefd5';
const BASE_URL = 'https://api.themoviedb.org/3';
const ADMIN_PASSWORD_KEY = 'ks_admin_auth';
const ADMIN_PASSWORD = 'admin123';
const LS_VIDEO_URLS_KEY = 'ks_admin_video_urls';
const LS_SUBTITLES_KEY = 'ks_admin_subtitles';
const LS_GEMINI_API_KEY = 'ks_gemini_api_key';
const DEFAULT_GEMINI_KEY = 'AQ.Ab8RN6IdiHTVb6g1ulsCJK60DDCUcn1VUxrPmHxdrld7ZjHVlg';

const sanitizeKey = (key: string): string => key ? key.replace(/['"`]/g, '').trim() : '';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function srtToVttClient(srt: string): string {
  let text = srt.replace(/^\uFEFF/, '');
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  text = text.replace(/(\d{2}:\d{2}),(\d{3})/g, '00:$1.$2');
  if (!text.trim().toUpperCase().startsWith('WEBVTT')) {
    text = 'WEBVTT\n\n' + text.trim() + '\n';
  }
  return text;
}

function subtitleVttPublicUrl(mediaType: string, tmdbId: number, season?: number | null, episode?: number | null): string {
  const path = subtitleStoragePath(mediaType, tmdbId, season || undefined, episode || undefined);
  return `${SUPABASE_URL}/storage/v1/object/public/subtitles/${path}`;
}

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch { return fallback; }
}

function saveLS<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

interface LocalVideoUrl extends VideoUrl {
  displayTitle: string;
}

interface LocalSubtitle extends Subtitle {
  displayTitle: string;
}

export default function AdminDashboard() {
  const [authed, setAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [videoUrls, setVideoUrls] = useState<VideoUrl[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [isTv, setIsTv] = useState(false);
  const [seasonNumber, setSeasonNumber] = useState<number | ''>('');
  const [episodeNumber, setEpisodeNumber] = useState<number | ''>('');
  const [subtitleText, setSubtitleText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileFormat, setFileFormat] = useState<'srt' | 'vtt'>('vtt');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [videoUrlLabel, setVideoUrlLabel] = useState('');
  const [videoUrlSeason, setVideoUrlSeason] = useState<number | ''>('');
  const [videoUrlEpisode, setVideoUrlEpisode] = useState<number | ''>('');
  const [savingUrl, setSavingUrl] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState('');
  const [hasVideoFile, setHasVideoFile] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoFileName, setVideoFileName] = useState('');
  const [videoUrlTitles, setVideoUrlTitles] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'subtitles' | 'videos' | 'translator' | 'reviews' | 'deleted'>('subtitles');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pending reviews state
  const [pendingReviews, setPendingReviews] = useState<ReviewItem[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Deleted items state
  interface DeletedItem {
    id: string;
    tmdb_id: number;
    media_type: string;
    created_at: string;
    title?: string;
    poster_path?: string;
  }
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);

  const loadDeletedItems = useCallback(async () => {
    setDeletedLoading(true);
    try {
      const { data, error } = await supabase
        .from('deleted_items')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        setDeletedItems([]);
        return;
      }
      // Fetch TMDB metadata for each deleted item
      const items = (data || []) as DeletedItem[];
      await Promise.all(items.map(async (item) => {
        try {
          const tmdbType = item.media_type === 'tv' ? 'tv' : 'movie';
          const res = await fetch(`${BASE_URL}/${tmdbType}/${item.tmdb_id}?api_key=${API_KEY}`);
          const tmdbData = await res.json();
          item.title = tmdbData.title || tmdbData.name || `TMDB ${item.tmdb_id}`;
          item.poster_path = tmdbData.poster_path;
        } catch {
          item.title = `TMDB ${item.tmdb_id}`;
        }
      }));
      setDeletedItems(items);
    } catch {
      setDeletedItems([]);
    } finally {
      setDeletedLoading(false);
    }
  }, []);

  const handleRestoreItem = async (tmdbId: number) => {
    try {
      const { error } = await supabase
        .from('deleted_items')
        .delete()
        .eq('tmdb_id', tmdbId);
      if (error) throw error;
      setDeletedItems(prev => prev.filter(i => i.tmdb_id !== tmdbId));
      setMessage({ type: 'success', text: 'بەرهەم گەڕێندرایەوە' });
    } catch {
      setMessage({ type: 'error', text: 'نەتوانرا بگەڕێندرێتەوە' });
    }
  };

  const loadPendingReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          *,
          user_profiles!reviews_user_id_fkey (username, avatar_url)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const pending = (data || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        tmdb_id: r.tmdb_id,
        media_type: r.media_type,
        rating: r.rating,
        review_text: r.review_text,
        is_spoiler: r.is_spoiler,
        status: r.status || 'pending',
        created_at: r.created_at,
        username: r.user_profiles?.username,
        avatar_url: r.user_profiles?.avatar_url,
      })) as ReviewItem[];

      setPendingReviews(pending);
    } catch (err) {
      console.error('Failed to load pending reviews:', err);
      setPendingReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  // Realtime subscription: auto-refresh pending reviews when any review changes
  useEffect(() => {
    if (!authed) return;
    const channel = supabase
      .channel('reviews-moderation')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, (payload: RealtimePostgresChangesPayload<any>) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new;
          if (r.status === 'pending') {
            setPendingReviews(prev => {
              if (prev.some(p => p.id === r.id)) return prev;
            return [{ ...r, username: undefined, avatar_url: undefined }, ...prev];
            });
            loadPendingReviews();
          }
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new;
          if (r.status !== 'pending') {
            setPendingReviews(prev => prev.filter(p => p.id !== r.id));
          } else {
            loadPendingReviews();
          }
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old;
          setPendingReviews(prev => prev.filter(p => p.id !== r.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [authed, loadPendingReviews]);

  const handleApproveReview = async (reviewId: string) => {
    setPendingReviews(prev => prev.filter(r => r.id !== reviewId));
    try {
      const { error } = await supabase.from('reviews').update({ status: 'approved' }).eq('id', reviewId);
      if (error) throw error;
      setMessage({ type: 'success', text: 'پێداچوونەوە پەسەندکرا' });
    } catch (err) {
      console.error('Approve failed:', err);
      setPendingReviews(prev => prev.filter(r => r.id !== reviewId));
      setMessage({ type: 'error', text: 'نەتوانرا پەسەند بکرێت' });
      loadPendingReviews();
    }
  };

  const handleRejectReview = async (reviewId: string) => {
    setPendingReviews(prev => prev.filter(r => r.id !== reviewId));
    try {
      const { error } = await supabase.from('reviews').update({ status: 'rejected' }).eq('id', reviewId);
      if (error) throw error;
      setMessage({ type: 'success', text: 'پێداچوونەوە ڕەتکرایەوە' });
    } catch (err) {
      console.error('Reject failed:', err);
      setMessage({ type: 'error', text: 'نەتوانرا ڕەت بکرێتەوە' });
      loadPendingReviews();
    }
  };

  // Translator state
  const [geminiApiKey, setGeminiApiKey] = useState(sanitizeKey(DEFAULT_GEMINI_KEY));
  const [transFileContent, setTransFileContent] = useState('');
  const [transFileName, setTransFileName] = useState('');
  const [transFileFormat, setTransFileFormat] = useState<'srt' | 'vtt'>('vtt');
  const [translating, setTranslating] = useState(false);
  const [transProgress, setTransProgress] = useState<{ done: number; total: number } | null>(null);
  const [transBatchInfo, setTransBatchInfo] = useState<{ current: number; total: number; remainingSec: number } | null>(null);
  const [transRateLimit, setTransRateLimit] = useState<{ waiting: boolean; waitSeconds: number; attempt: number } | null>(null);
  const [transPairs, setTransPairs] = useState<TranslationPair[]>([]);
  const [transBlocks, setTransBlocks] = useState<SubtitleBlock[]>([]);
  const [savingTransSubtitle, setSavingTransSubtitle] = useState(false);
  const transFileRef = useRef<HTMLInputElement>(null);

  // Subtitle editor table state (subtitles tab)
  const [subBlocks, setSubBlocks] = useState<{ index: string; timestamp: string; original: string; translated: string }[]>([]);
  const [autoTranslating, setAutoTranslating] = useState(false);
  const [autoTransProgress, setAutoTransProgress] = useState<{ done: number; total: number } | null>(null);
  const [autoTransBatchInfo, setAutoTransBatchInfo] = useState<{ current: number; total: number; remainingSec: number } | null>(null);
  const [autoTransRateLimit, setAutoTransRateLimit] = useState<{ waiting: boolean; waitSeconds: number; attempt: number } | null>(null);
  const [savingSubtitles, setSavingSubtitles] = useState(false);
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null);

  // Auto-translate (server-side) state
  const [translatingSubs, setTranslatingSubs] = useState<Set<string>>(new Set());
  const [translateAllRunning, setTranslateAllRunning] = useState(false);
  const [translateAllProgress, setTranslateAllProgress] = useState<{ done: number; total: number; current?: string } | null>(null);
  const [transErrorBox, setTransErrorBox] = useState<string | null>(null);
  const [previewSub, setPreviewSub] = useState<Subtitle | null>(null);

  const { isAdmin: isAuthAdmin } = useAuth();

  useEffect(() => {
    if (isAuthAdmin) {
      setAuthed(true);
      loadSubtitles();
      loadVideoUrls();
      return;
    }
    const saved = sessionStorage.getItem(ADMIN_PASSWORD_KEY);
    if (saved === ADMIN_PASSWORD) {
      setAuthed(true);
      loadSubtitles();
      loadVideoUrls();
    }
    // Restore Gemini API key from localStorage
    const savedKey = localStorage.getItem(LS_GEMINI_API_KEY);
    if (savedKey) setGeminiApiKey(sanitizeKey(savedKey));
  }, [isAuthAdmin]);

  useEffect(() => {
    if (searchQuery.length > 2) {
      const timer = setTimeout(() => {
        fetch(`${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(searchQuery)}`)
          .then(r => r.json())
          .then(data => setSearchResults((data?.results || []).filter((i: MediaItem) => i.poster_path)))
          .catch(err => { console.error(err); setSearchResults([]); });
      }, 400);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setAuthed(true);
      sessionStorage.setItem(ADMIN_PASSWORD_KEY, ADMIN_PASSWORD);
      loadSubtitles();
      loadVideoUrls();
      setAuthError('');
    } else {
      setAuthError('وشەی نهێنی هەڵەیە');
    }
  };

  const handleLogout = () => {
    setAuthed(false);
    sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
    setPasswordInput('');
  };

  const loadSubtitles = async () => {
    try {
      const data = await fetchAllSubtitles(ADMIN_PASSWORD);
      setSubtitles(data);
      saveLS(LS_SUBTITLES_KEY, data);
      setMessage(null);
    } catch (err) {
      const errMsg = (err as Error).message || 'هەڵە لە بارکردنی ژێرنووسەکان';
      // Fall back to localStorage cache
      const local = loadLS<Subtitle[]>(LS_SUBTITLES_KEY, []);
      if (local.length > 0) {
        setSubtitles(local);
        setMessage({ type: 'error', text: 'نەتوانرا لە سێرڤەر باربکرێت — پیشاندانی ژێرنووسە پاشەکەوتکراوەکان لە یادەوەری' });
      } else {
        setMessage({ type: 'error', text: errMsg });
      }
    }
  };

  const loadVideoUrls = async () => {
    try {
      const data = await fetchVideoUrls(ADMIN_PASSWORD);
      setVideoUrls(data);
      saveLS(LS_VIDEO_URLS_KEY, data);
      // Enrich each video URL with the movie/series title from TMDB
      const titleMap: Record<string, string> = {};
      await Promise.all(data.map(async (vu) => {
        const cacheKey = `${vu.media_type}-${vu.tmdb_id}`;
        if (titleMap[cacheKey]) return;
        try {
          const tmdbType = vu.media_type === 'tv' ? 'tv' : 'movie';
          const res = await fetch(`${BASE_URL}/${tmdbType}/${vu.tmdb_id}?api_key=${API_KEY}`);
          const tmdbData = await res.json();
          const t = tmdbData.title || tmdbData.name || `TMDB ${vu.tmdb_id}`;
          titleMap[cacheKey] = t;
        } catch {
          titleMap[cacheKey] = `TMDB ${vu.tmdb_id}`;
        }
      }));
      setVideoUrlTitles(titleMap);
      saveLS(LS_VIDEO_URLS_KEY + '_titles', titleMap);
    } catch (err) {
      // Fall back to localStorage cache
      const local = loadLS<VideoUrl[]>(LS_VIDEO_URLS_KEY, []);
      const localTitles = loadLS<Record<string, string>>(LS_VIDEO_URLS_KEY + '_titles', {});
      if (local.length > 0) {
        setVideoUrls(local);
        setVideoUrlTitles(localTitles);
        setMessage({ type: 'error', text: 'نەتوانرا لە سێرڤەر باربکرێت — پیشاندانی URLە پاشەکەوتکراوەکان لە یادەوەری' });
      } else {
        console.error('Failed to load video URLs', err);
      }
    }
  };

  const handleSelectItem = (item: MediaItem) => {
    setSelectedItem(item);
    setIsTv(item.media_type === 'tv' || !item.title);
    setSubtitleText('');
    setFileName('');
    setSubBlocks([]);
    setEditingId(null);
    setSeasonNumber('');
    setEpisodeNumber('');
    setVideoUrlInput('');
    setVideoUrlLabel('');
    setVideoUrlSeason('');
    setVideoUrlEpisode('');
    setVideoFile(null);
    setVideoFileName('');
    setUploadProgress(0);
  };

  const handleVideoUploadComplete = (url: string) => {
    setUploadedVideoUrl(url);
    setUploadProgress(100);
  };

  const handleVideoUploadProgress = (pct: number) => {
    setUploadProgress(pct);
  };

  const handleVideoFileSelected = (hasFile: boolean) => {
    setHasVideoFile(hasFile);
    if (!hasFile) {
      setHasVideoFile(false);
      setUploadedVideoUrl('');
      setUploadProgress(0);
    }
  };

  const handleSaveVideoUrl = async () => {
    if (!selectedItem) {
      setMessage({ type: 'error', text: 'تکایە بەرهەمێک دیاری بکە' });
      return;
    }
    if (!videoUrlInput.trim() && !hasVideoFile) {
      setMessage({ type: 'error', text: 'تکایە URLی ڤیدیۆ بنووسە یان فایلێک هەڵبژێرە' });
      return;
    }
    setSavingUrl(true);
    setUploadProgress(0);
    try {
      let finalUrl = videoUrlInput.trim();

      if (hasVideoFile) {
        if (!uploadedVideoUrl) {
          setMessage({ type: 'error', text: 'تکایە سەرەتا فایلەکە باربکە — پاشان پاشەکەوتکردن کلیک بکە' });
          setSavingUrl(false);
          return;
        }
        finalUrl = uploadedVideoUrl;
      }

      const saved = await upsertVideoUrl(ADMIN_PASSWORD, {
        tmdb_id: selectedItem.id,
        media_type: isTv ? 'tv' : 'movie',
        season_number: isTv && videoUrlSeason ? Number(videoUrlSeason) : undefined,
        episode_number: isTv && videoUrlEpisode ? Number(videoUrlEpisode) : undefined,
        url: finalUrl,
        label: videoUrlLabel.trim() || undefined,
      });
      const currentLocal = loadLS<VideoUrl[]>(LS_VIDEO_URLS_KEY, []);
      const filtered = currentLocal.filter(u => u.id !== saved.id);
      filtered.push(saved);
      saveLS(LS_VIDEO_URLS_KEY, filtered);
      setMessage({ type: 'success', text: hasVideoFile ? 'فایلی ڤیدیۆ بارکرا و پاشەکەوتکرا' : 'URLی ڤیدیۆ پاشەکەوتکرا' });
      setVideoUrlInput('');
      setVideoUrlLabel('');
      setHasVideoFile(false);
      setUploadedVideoUrl('');
      setUploadProgress(0);
      await loadVideoUrls();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
      setUploadProgress(0);
    } finally {
      setSavingUrl(false);
    }
  };

  const handleDeleteVideoUrl = async (id: string) => {
    if (!confirm('دڵنیایت لە سڕینەوەی ئەم URLە؟')) return;
    try {
      await deleteVideoUrl(ADMIN_PASSWORD, id);
    } catch { /* server may fail, still remove locally */ }
    // Remove from localStorage regardless
    const currentLocal = loadLS<VideoUrl[]>(LS_VIDEO_URLS_KEY, []);
    saveLS(LS_VIDEO_URLS_KEY, currentLocal.filter(u => u.id !== id));
    await loadVideoUrls();
    setMessage({ type: 'success', text: 'URLی ڤیدیۆ سڕایەوە' });
  };

  const handleEditVideoUrl = (vu: VideoUrl) => {
    const titleKey = `${vu.media_type}-${vu.tmdb_id}`;
    const displayTitle = videoUrlTitles[titleKey] || `TMDB ${vu.tmdb_id}`;
    setSelectedItem({
      id: vu.tmdb_id,
      title: vu.media_type === 'movie' ? displayTitle : undefined,
      name: vu.media_type === 'tv' ? displayTitle : undefined,
      poster_path: '',
      overview: '',
      media_type: vu.media_type,
    });
    setIsTv(vu.media_type === 'tv');
    setVideoUrlInput(vu.url);
    setVideoUrlLabel(vu.label || '');
    setVideoUrlSeason(vu.season_number || '');
    setVideoUrlEpisode(vu.episode_number || '');
    setActiveTab('videos');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() as 'srt' | 'vtt';
    if (ext !== 'srt' && ext !== 'vtt') {
      setMessage({ type: 'error', text: 'تکایە تەنها فایلی SRT یان VTT هەڵبژێرە' });
      return;
    }
    setFileName(file.name);
    setFileFormat(ext);
    const reader = new FileReader();
    reader.onload = (ev) => {
      let text = ev.target?.result as string;
      // Convert SRT to VTT client-side before storing
      if (ext === 'srt') {
        text = srtToVttClient(text);
        setFileFormat('vtt');
      }
      setSubtitleText(text);
      // Parse into blocks for the table editor
      const blocks = parseSubtitleBlocks(text);
      setSubBlocks(blocks.map((b, i) => ({
        index: b.index || String(i + 1),
        timestamp: b.timestamp,
        original: b.text,
        translated: '',
      })));
    };
    reader.readAsText(file);
  };

  const handleAutoTranslateAll = async () => {
    if (!subBlocks.length) {
      setMessage({ type: 'error', text: 'تکایە سەرەتا فایلی ژێرنووس بار بکە' });
      return;
    }
    if (!sanitizeKey(geminiApiKey)) {
      setMessage({ type: 'error', text: 'تکایە کلیلی Gemini API بنووسە لە بەشی وەرگێڕ' });
      return;
    }
    setAutoTranslating(true);
    setAutoTransProgress({ done: 0, total: subBlocks.length });
    setAutoTransBatchInfo(null);
    setAutoTransRateLimit(null);
    setMessage(null);
    saveLS(LS_GEMINI_API_KEY, sanitizeKey(geminiApiKey));
    try {
      const blocks: SubtitleBlock[] = subBlocks.map(b => ({
        index: b.index,
        timestamp: b.timestamp,
        text: b.original,
      }));
      const result = await translateWithGeminiClientSide(
        blocks,
        sanitizeKey(geminiApiKey),
        fileFormat,
        (done, total) => setAutoTransProgress({ done, total }),
        (batchResults) => {
          setSubBlocks(prev => prev.map((blk, i) => {
            const t = batchResults[i];
            return t && t.translated ? { ...blk, translated: t.translated } : blk;
          }));
        },
        (currentBatch, totalBatches, remainingSec) => setAutoTransBatchInfo({ current: currentBatch, total: totalBatches, remainingSec }),
        (status) => setAutoTransRateLimit(status.waiting ? { waiting: true, waitSeconds: status.waitSeconds, attempt: status.attempt } : null)
      );
      setSubBlocks(prev => prev.map((blk, i) => {
        const t = result.translations[i];
        return t ? { ...blk, translated: t.translated } : blk;
      }));
      setMessage({
        type: 'success',
        text: `وەرگێڕان تەواوبوو — ${result.block_count} ژێرنووس وەرگێڕدرا. دەتوانیت دەستکاری بکەیت پێش پاشەکەوتکردن.`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setAutoTranslating(false);
      setAutoTransProgress(null);
      setAutoTransBatchInfo(null);
      setAutoTransRateLimit(null);
    }
  };

  const handleSubBlockEdit = (idx: number, translated: string) => {
    setSubBlocks(prev => prev.map((blk, i) => i === idx ? { ...blk, translated } : blk));
  };

  const handleSaveAndUpload = async () => {
    if (!selectedItem) {
      setMessage({ type: 'error', text: 'تکایە بەرهەمێک دیاری بکە' });
      return;
    }
    if (subBlocks.length === 0) {
      setMessage({ type: 'error', text: 'تکایە فایلێک بار بکە' });
      return;
    }
    const hasTranslations = subBlocks.some(b => b.translated.trim());
    if (!hasTranslations) {
      setMessage({ type: 'error', text: 'تکایە یەکەم وەرگێڕان بکە یان دەستی بنووسە' });
      return;
    }
    setSavingSubtitles(true);
    setMessage(null);
    try {
      const content = reassembleSubtitle(
        subBlocks.map(b => ({ index: b.index, timestamp: b.timestamp, text: b.translated || b.original })),
        fileFormat
      );
      await uploadSubtitle(ADMIN_PASSWORD, {
        tmdb_id: selectedItem.id,
        media_type: isTv ? 'tv' : 'movie',
        season_number: isTv && seasonNumber ? Number(seasonNumber) : undefined,
        episode_number: isTv && episodeNumber ? Number(episodeNumber) : undefined,
        title: selectedItem.title || selectedItem.name || '',
        content,
        language: 'ckb',
      });
      // Upload VTT + sub-info JSON to Storage for VidSrc sub.info support
      try {
        await uploadSubtitleToStorage(
          content,
          selectedItem.id,
          isTv ? 'tv' : 'movie',
          isTv && seasonNumber ? Number(seasonNumber) : undefined,
          isTv && episodeNumber ? Number(episodeNumber) : undefined,
        );
      } catch (storageErr) {
        console.warn('Storage upload skipped:', storageErr);
      }
      setMessage({
        type: 'success',
        text: `ژێرنووس بە سەرکەوتوویی پاشەکەوتکرا — ${subBlocks.length} ژێرنووس`,
      });
      // Reset
      setSubBlocks([]);
      setSubtitleText('');
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadSubtitles();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSavingSubtitles(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !subtitleText.trim()) {
      setMessage({ type: 'error', text: 'تکایە بەرهەمێک دیاری بکە و فایلی ژێرنووس بار بکە' });
      return;
    };

    setLoading(true);
    try {
      const payload = {
        tmdb_id: selectedItem.id,
        media_type: isTv ? 'tv' : 'movie',
        season_number: isTv && seasonNumber ? Number(seasonNumber) : undefined,
        episode_number: isTv && episodeNumber ? Number(episodeNumber) : undefined,
        title: selectedItem.title || selectedItem.name || '',
        content: subtitleText,
      };

      if (editingId) {
        await updateSubtitle(ADMIN_PASSWORD, editingId, { content: subtitleText });
        // Upload updated VTT + JSON to Storage
        try {
          await uploadSubtitleToStorage(
            subtitleText,
            selectedItem.id,
            isTv ? 'tv' : 'movie',
            isTv && seasonNumber ? Number(seasonNumber) : undefined,
            isTv && episodeNumber ? Number(episodeNumber) : undefined,
          );
        } catch (storageErr) {
          console.warn('Storage upload skipped:', storageErr);
        }
        // Update localStorage cache
        const currentLocal = loadLS<Subtitle[]>(LS_SUBTITLES_KEY, []);
        const idx = currentLocal.findIndex(s => s.id === editingId);
        if (idx >= 0) {
          currentLocal[idx].content = subtitleText;
          saveLS(LS_SUBTITLES_KEY, currentLocal);
        }
        setMessage({ type: 'success', text: 'ژێرنووس نوێکرایەوە' });
      } else {
        const uploaded = await uploadSubtitle(ADMIN_PASSWORD, payload);
        // Upload VTT + sub-info JSON to Storage for VidSrc sub.info support
        try {
          await uploadSubtitleToStorage(
            subtitleText,
            selectedItem.id,
            isTv ? 'tv' : 'movie',
            isTv && seasonNumber ? Number(seasonNumber) : undefined,
            isTv && episodeNumber ? Number(episodeNumber) : undefined,
          );
        } catch (storageErr) {
          console.warn('Storage upload skipped:', storageErr);
        }
        // Persist to localStorage immediately
        const currentLocal = loadLS<Subtitle[]>(LS_SUBTITLES_KEY, []);
        currentLocal.push(uploaded);
        saveLS(LS_SUBTITLES_KEY, currentLocal);
        setMessage({ type: 'success', text: 'ژێرنووس بە سەرکەوتوویی پاشەکەوتکرا' });
      }
      setSubtitleText('');
      setFileName('');
      setEditingId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadSubtitles();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (sub: Subtitle) => {
    setEditingId(sub.id);
    setSelectedItem({
      id: sub.tmdb_id,
      title: sub.media_type === 'movie' ? sub.title : undefined,
      name: sub.media_type === 'tv' ? sub.title : undefined,
      poster_path: '',
      overview: '',
      media_type: sub.media_type,
    });
    setIsTv(sub.media_type === 'tv');
    setSeasonNumber(sub.season_number || '');
    setEpisodeNumber(sub.episode_number || '');
    setSubtitleText(sub.content);
    setFileName(sub.title + '.vtt');
    setFileFormat('vtt');
    // Parse existing subtitle into blocks for editing
    const blocks = parseSubtitleBlocks(sub.content);
    setSubBlocks(blocks.map((b, i) => ({
      index: b.index || String(i + 1),
      timestamp: b.timestamp,
      original: b.text,
      translated: b.text,
    })));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('دڵنیایت لە سڕینەوەی ئەم ژێرنووسە؟')) return;
    try {
      await deleteSubtitle(ADMIN_PASSWORD, id);
    } catch { /* server may fail, still remove locally */ }
    // Remove from localStorage regardless
    const currentLocal = loadLS<Subtitle[]>(LS_SUBTITLES_KEY, []);
    saveLS(LS_SUBTITLES_KEY, currentLocal.filter(s => s.id !== id));
    await loadSubtitles();
    setMessage({ type: 'success', text: 'ژێرنووس سڕایەوە' });
  };

  const handleTransFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() as 'srt' | 'vtt';
    if (ext !== 'srt' && ext !== 'vtt') {
      setMessage({ type: 'error', text: 'تکایە تەنها فایلی SRT یان VTT هەڵبژێرە' });
      return;
    }
    setTransFileName(file.name);
    setTransFileFormat(ext);
    setTransPairs([]);
    setTransBlocks([]);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setTransFileContent(text);
      // Parse immediately into blocks for the dual-view table
      const blocks = parseSubtitleBlocks(text);
      setTransBlocks(blocks);
      setTransPairs(blocks.map((b, i) => ({
        index: b.index || String(i + 1),
        timestamp: b.timestamp,
        original: b.text,
        translated: '',
      })));
    };
    reader.readAsText(file);
  };

  const handleTranslate = async () => {
    if (!transBlocks.length) {
      setMessage({ type: 'error', text: 'تکایە سەرەتا فایلێک بار بکە' });
      return;
    }
    if (!sanitizeKey(geminiApiKey)) {
      setMessage({ type: 'error', text: 'تکایە کلیلی Gemini API بنووسە' });
      return;
    }
    setTranslating(true);
    setTransProgress({ done: 0, total: transBlocks.length });
    setTransBatchInfo(null);
    setTransRateLimit(null);
    setMessage(null);
    saveLS(LS_GEMINI_API_KEY, sanitizeKey(geminiApiKey));
    try {
      const result = await translateWithGeminiClientSide(
        transBlocks,
        sanitizeKey(geminiApiKey),
        transFileFormat,
        (done, total) => setTransProgress({ done, total }),
        (batchResults) => {
          setTransPairs(prev => prev.map((p, i) => {
            const t = batchResults[i];
            return t && t.translated ? { ...p, translated: t.translated } : p;
          }));
        },
        (currentBatch, totalBatches, remainingSec) => setTransBatchInfo({ current: currentBatch, total: totalBatches, remainingSec }),
        (status) => setTransRateLimit(status.waiting ? { waiting: true, waitSeconds: status.waitSeconds, attempt: status.attempt } : null)
      );
      setTransPairs(result.translations.map(t => ({
        index: t.index,
        timestamp: t.timestamp,
        original: t.original,
        translated: t.translated,
      })));
      setMessage({ type: 'success', text: `وەرگێڕان تەواوبوو — ${result.block_count} ژێرنووس` });
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setTranslating(false);
      setTransProgress(null);
      setTransBatchInfo(null);
      setTransRateLimit(null);
    }
  };

  const handleTransPairEdit = (idx: number, translated: string) => {
    setTransPairs(prev => prev.map((p, i) => i === idx ? { ...p, translated } : p));
  };

  const handleSaveTransSubtitle = async () => {
    if (!selectedItem) {
      setMessage({ type: 'error', text: 'تکایە بەرهەمێک دیاری بکە' });
      return;
    }
    if (transPairs.length === 0) {
      setMessage({ type: 'error', text: 'تکایە سەرەتا فایلێک بار بکە و وەرگێڕان بکە' });
      return;
    }
    const hasTranslations = transPairs.some(p => p.translated.trim());
    if (!hasTranslations) {
      setMessage({ type: 'error', text: 'تکایە یەکەم وەرگێڕان بکە یان دەستی بنووسە' });
      return;
    }
    setSavingTransSubtitle(true);
    setMessage(null);
    try {
      const content = reassembleSubtitle(
        transPairs.map(p => ({ index: p.index, timestamp: p.timestamp, text: p.translated || p.original })),
        transFileFormat
      );
      await uploadSubtitle(ADMIN_PASSWORD, {
        tmdb_id: selectedItem.id,
        media_type: isTv ? 'tv' : 'movie',
        season_number: isTv && seasonNumber ? Number(seasonNumber) : undefined,
        episode_number: isTv && episodeNumber ? Number(episodeNumber) : undefined,
        title: selectedItem.title || selectedItem.name || '',
        content,
        language: 'ckb',
      });
      // Upload VTT + sub-info JSON to Storage for VidSrc sub.info support
      try {
        await uploadSubtitleToStorage(
          content,
          selectedItem.id,
          isTv ? 'tv' : 'movie',
          isTv && seasonNumber ? Number(seasonNumber) : undefined,
          isTv && episodeNumber ? Number(episodeNumber) : undefined,
        );
      } catch (storageErr) {
        console.warn('Storage upload skipped:', storageErr);
      }
      setMessage({ type: 'success', text: `ژێرنووس بە سەرکەوتوویی پاشەکەوتکرا — ${transPairs.length} ژێرنووس` });
      setTransPairs([]);
      setTransBlocks([]);
      setTransFileContent('');
      setTransFileName('');
      if (transFileRef.current) transFileRef.current.value = '';
      await loadSubtitles();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSavingTransSubtitle(false);
    }
  };

  const handleDownloadTranslated = () => {
    if (transPairs.length === 0) return;
    const baseName = transFileName.replace(/\.(srt|vtt)$/i, '') || 'subtitles';
    const content = reassembleSubtitle(
      transPairs.map(p => ({ index: p.index, timestamp: p.timestamp, text: p.translated })),
      transFileFormat
    );
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_ckb.${transFileFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!authed) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#050B14] text-white flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-cyan-500/20 text-cyan-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-cyan-500/30">
              <Lock className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-black text-white">بەڕێوەبەرایەتی</h1>
            <p className="text-white/50 text-sm mt-2">بۆ چوونەژوورەوە وشەی نهێنی بنووسە</p>
          </div>
          <form onSubmit={handleLogin} className="bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-xl space-y-4">
            {authError && (
              <div className="bg-red-500/20 border border-red-500/40 text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                <AlertCircle className="w-5 h-5" /> {authError}
              </div>
            )}
            <div>
              <label className="block text-sm font-bold text-white/80 mb-1">وشەی نهێنی</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                autoFocus
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 py-3.5 rounded-xl font-bold text-white transition">
              چوونەژوورەوە
            </button>
            <button type="button" onClick={() => { window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); }} className="block text-center text-cyan-400 text-sm hover:underline w-full">گەڕانەوە بۆ ماڵەوە</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#050B14] text-white p-3 sm:p-4 lg:p-8 overflow-x-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 lg:mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-cyan-500/20 text-cyan-400 rounded-xl flex items-center justify-center border border-cyan-500/30">
              <Subtitles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black">بەڕێوەبەرایەتی ژێرنووسەکان</h1>
              <p className="text-white/50 text-sm">بەڕێوەبردنی ژێرنوسی کوردی</p>
            </div>
          </div>
          <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
            <button onClick={() => { window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); }} className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-sm hover:bg-white/10 transition flex-1 sm:flex-none">
              <ArrowLeft className="w-4 h-4" /> ماڵەوە
            </button>
            <button onClick={handleLogout} className="flex items-center justify-center gap-2 bg-red-500/20 border border-red-500/40 text-red-400 px-4 py-2 rounded-xl text-sm hover:bg-red-500 hover:text-white transition flex-1 sm:flex-none">
              <LogOut className="w-4 h-4" /> دەرچوون
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-green-500/20 border border-green-500/40 text-green-400' : 'bg-red-500/20 border border-red-500/40 text-red-400'}`}>
            {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {message.text}
          </div>
        )}

        {/* ── TAB BAR ── */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('subtitles')}
            className={`flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl font-bold text-sm transition-all border flex-1 sm:flex-none ${activeTab === 'subtitles' ? 'bg-cyan-600 border-cyan-400/50 text-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
          >
            <Subtitles className="w-4 h-4" /> ژێرنووسەکان
          </button>
          <button
            onClick={() => setActiveTab('videos')}
            className={`flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl font-bold text-sm transition-all border flex-1 sm:flex-none ${activeTab === 'videos' ? 'bg-cyan-600 border-cyan-400/50 text-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
          >
            <Video className="w-4 h-4" /> URLی ڤیدیۆ
          </button>
          <button
            onClick={() => setActiveTab('translator')}
            className={`flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl font-bold text-sm transition-all border flex-1 sm:flex-none ${activeTab === 'translator' ? 'bg-cyan-600 border-cyan-400/50 text-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
          >
            <Languages className="w-4 h-4" /> وەرگێڕ
          </button>
          <button
            onClick={() => { setActiveTab('reviews'); loadPendingReviews(); }}
            className={`flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl font-bold text-sm transition-all border flex-1 sm:flex-none ${activeTab === 'reviews' ? 'bg-cyan-600 border-cyan-400/50 text-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
          >
            <MessageSquare className="w-4 h-4" /> پێداچوونەوەکان
            {pendingReviews.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-black">{pendingReviews.length}</span>
            )}
          </button>
        </div>

        {activeTab === 'subtitles' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
          {/* Left: Search + Upload Form */}
          <div className="space-y-4 lg:space-y-6 min-w-0">
            <div className="bg-white/5 border border-white/10 p-4 sm:p-6 rounded-3xl backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Search className="w-5 h-5 text-cyan-400" /> گەڕان بۆ بەرهەم</h2>
              <div className="relative group mb-4">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 group-focus-within:text-cyan-400 transition-colors pointer-events-none" />
                <input
                  type="text"
                  dir="auto"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ناوی فیلم یان زنجیرە بنووسە..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-4 pr-12 py-3 text-white focus:outline-none focus:border-cyan-500 focus:bg-black/50 focus:shadow-lg focus:shadow-cyan-500/10 transition-all placeholder-white/40"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {searchResults.slice(0, 10).map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectItem(item)}
                      className={`w-full flex items-center gap-3 p-2 rounded-xl border transition text-right ${selectedItem?.id === item.id ? 'bg-cyan-600/20 border-cyan-500' : 'bg-black/30 border-white/5 hover:bg-white/5'}`}
                    >
                      <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt="" className="w-10 h-14 rounded object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{item.title || item.name}</p>
                        <p className="text-xs text-white/50 flex items-center gap-1">
                          {item.media_type === 'tv' || !item.title ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                          {item.media_type === 'tv' || !item.title ? 'زنجیرە' : 'فیلم'} • ID: {item.id}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedItem && (
              <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 p-4 sm:p-6 rounded-3xl backdrop-blur-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    {editingId ? <Edit3 className="w-5 h-5 text-cyan-400" /> : <Upload className="w-5 h-5 text-cyan-400" />}
                    {editingId ? 'دەستکاری ژێرنووس' : 'بارکردنی ژێرنووس'}
                  </h2>
                  {editingId && (
                    <button type="button" onClick={() => { setEditingId(null); setSubtitleText(''); }} className="text-white/50 hover:text-white">
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>

                <div className="bg-black/30 border border-white/5 p-3 rounded-xl">
                  <p className="font-bold text-sm">{selectedItem.title || selectedItem.name}</p>
                  <p className="text-xs text-white/50">
                    {isTv ? 'زنجیرە' : 'فیلم'} • TMDB ID: {selectedItem.id}
                  </p>
                </div>

                {isTv && !editingId && (
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-sm font-bold text-white/80 mb-1">وەرز</label>
                      <input
                        type="number" min={1}
                        value={seasonNumber}
                        onChange={(e) => setSeasonNumber(e.target.value ? Number(e.target.value) : '')}
                        placeholder="1"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 sm:px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-white/80 mb-1">ئەڵقە</label>
                      <input
                        type="number" min={1}
                        value={episodeNumber}
                        onChange={(e) => setEpisodeNumber(e.target.value ? Number(e.target.value) : '')}
                        placeholder="1"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 sm:px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold text-white/80 mb-2">بارکردنی فایلی ژێرنووس</label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="relative border-2 border-dashed border-white/15 hover:border-cyan-500/50 rounded-2xl p-8 text-center cursor-pointer transition-all bg-black/30 hover:bg-black/40 group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".srt,.vtt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    {fileName ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 bg-green-500/20 text-green-400 rounded-xl flex items-center justify-center border border-green-500/30">
                          <FileText className="w-6 h-6" />
                        </div>
                        <p className="text-green-400 font-bold text-sm">{fileName}</p>
                        <p className="text-white/40 text-xs">کلیک بکە بۆ گۆڕینی فایل</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 bg-cyan-500/20 text-cyan-400 rounded-xl flex items-center justify-center border border-cyan-500/30 group-hover:scale-110 transition-transform">
                          <Upload className="w-6 h-6" />
                        </div>
                        <p className="text-white/70 font-bold text-sm">فایلی SRT یان VTT هەڵبژێرە</p>
                        <p className="text-white/40 text-xs">کلیک بکە یان فایلەکە ڕابکێشە</p>
                      </div>
                    )}
                  </div>
                  {subtitleText && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-white/40">
                      <FileText className="w-3.5 h-3.5" />
                      <span>{fileFormat.toUpperCase()} • {subtitleText.length.toLocaleString()} هێما</span>
                    </div>
                  )}
                  <p className="text-xs text-white/40 mt-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400/60" />
                    فایلی SRT خۆکارانە دەگۆڕدرێت بۆ VTT — پشتگیری وەرگێڕانی AI بەردەستە
                  </p>
                </div>

                {/* ── SUBTITLE TABLE EDITOR ── */}
                {subBlocks.length > 0 && (
                  <div className="space-y-3">
                    {/* Header with Auto-Translate and Save buttons */}
                    <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                        <p className="text-xs font-bold text-cyan-400">
                          {subBlocks.length} ژێرنووس — دەستکاری بکە بۆ پێش پاشەکەوتکردن
                        </p>
                      </div>

                      {/* Auto-Translate All button */}
                      <button
                        type="button"
                        onClick={handleAutoTranslateAll}
                        disabled={autoTranslating || savingSubtitles}
                        className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 py-2.5 rounded-lg font-bold text-white text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {autoTranslating
                          ? (autoTransProgress && autoTransProgress.total > 0
                              ? `وەرگێڕان... ${autoTransProgress.done}/${autoTransProgress.total}`
                              : 'وەرگێڕان...')
                          : <><Languages className="w-4 h-4" /> وەرگێڕانی هەموو بە Gemini AI</>}
                      </button>

                      {/* Progress bar + remaining time */}
                      {autoTranslating && autoTransProgress && autoTransProgress.total > 0 && (
                        <div className="space-y-1.5">
                          {autoTransRateLimit && autoTransRateLimit.waiting && (
                            <div className="flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-400 text-xs font-bold animate-pulse">
                              <Clock className="w-4 h-4" />
                              <span>تکایە چاوەڕێ بکە... ڕاوەستانی کاتی گووگڵ ({autoTransRateLimit.waitSeconds} چرکە)</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[11px] text-white/50">
                            <span>{autoTransBatchInfo ? `بەش ${autoTransBatchInfo.current}/${autoTransBatchInfo.total}` : ''}</span>
                            <span>{autoTransBatchInfo ? `کاتی ماوە: ~${autoTransBatchInfo.remainingSec}چڕکە` : ''}</span>
                          </div>
                          <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-300"
                              style={{ width: `${(autoTransProgress.done / autoTransProgress.total) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <p className="text-[10px] text-white/40 text-center">
                        وەرگێڕان دەخاتە خانەکانەوە — پاشان دەتوانیت دەستکاری بکەیت پێش پاشەکەوتکردن
                      </p>

                      {/* Save & Upload button */}
                      <button
                        type="button"
                        onClick={handleSaveAndUpload}
                        disabled={savingSubtitles || autoTranslating || !subBlocks.some(b => b.translated.trim())}
                        className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 py-3 rounded-lg font-bold text-white text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {savingSubtitles
                          ? 'پاشەکەوتکردن...'
                          : <><Save className="w-4 h-4" /> پاشەکەوت و بارکردنی ژێرنووس</>}
                      </button>
                    </div>

                    {/* Subtitle rows table */}
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                      {subBlocks.map((blk, idx) => (
                        <div
                          key={idx}
                          className="bg-black/30 border border-white/5 rounded-xl overflow-hidden"
                        >
                          <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/5">
                            <span className="text-xs font-black text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">
                              #{blk.index}
                            </span>
                            <span className="text-xs text-white/40 font-mono" dir="ltr">
                              {blk.timestamp}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                            {/* Original English */}
                            <div className="p-3 border-l border-white/5">
                              <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1">English</p>
                              <p className="text-sm text-white/60 leading-relaxed" dir="ltr">
                                {blk.original}
                              </p>
                            </div>
                            {/* Editable Kurdish translation */}
                            <div className="p-3 bg-cyan-500/5">
                              <p className="text-[10px] font-bold text-cyan-400/60 uppercase tracking-wider mb-1">کوردی</p>
                              <textarea
                                value={blk.translated}
                                onChange={(e) => handleSubBlockEdit(idx, e.target.value)}
                                placeholder="وەرگێڕان لێرە بنووسە..."
                                dir="rtl"
                                spellCheck={false}
                                rows={2}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-white text-sm leading-relaxed focus:outline-none focus:border-cyan-500 transition resize-y min-h-[40px]"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Raw textarea fallback (hidden when blocks are shown) */}
                {subBlocks.length === 0 && (
                  <div>
                    <label className="block text-sm font-bold text-white/80 mb-2 flex items-center gap-1.5">
                      <Edit3 className="w-4 h-4 text-cyan-400" />
                      دەستکاری ژێرنووس
                    </label>
                    <textarea
                      value={subtitleText}
                      onChange={(e) => setSubtitleText(e.target.value)}
                      placeholder={editingId ? 'نووسەرەکەی خۆت بنووسە یان فایلێک بار بکە...' : 'فایلێک بار بکە یان نووسەرەکەی خۆت بنووسە...'}
                      dir="auto"
                      spellCheck={false}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-mono leading-relaxed focus:outline-none focus:border-cyan-500 transition min-h-[200px] max-h-[400px] resize-y"
                    />
                    {subtitleText && (
                      <p className="text-xs text-white/30 mt-1.5">
                        {subtitleText.split('\n').length} هێڵ • {subtitleText.length.toLocaleString()} هێما
                      </p>
                    )}
                  </div>
                )}

                {/* Save button for raw text mode (editing existing subtitle) */}
                {subBlocks.length === 0 && (
                  <button
                    type="submit"
                    disabled={loading || !subtitleText.trim()}
                    className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 py-3.5 rounded-xl font-bold text-white transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'سەرقاڵ...' : <><Save className="w-5 h-5" /> {editingId ? 'نوێکردنەوە' : 'پاشەکەوتکردن'}</>}
                  </button>
                )}
              </form>
            )}
          </div>

          {/* Right: Existing Subtitles List */}
          <div className="bg-white/5 border border-white/10 p-4 sm:p-6 rounded-3xl backdrop-blur-xl min-w-0">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Subtitles className="w-5 h-5 text-cyan-400" /> ژێرنووسە پاشەکەوتکراوەکان ({subtitles.length})</h2>
            {subtitles.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-8">هیچ ژێرنووسێک پاشەکەوت نەکراوە</p>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {subtitles.map(sub => (
                  <div key={sub.id} className="bg-black/30 border border-white/5 p-4 rounded-xl">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm truncate">{sub.title}</p>
                          {sub.is_auto && (
                            <span className="text-[9px] font-black bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30 flex-shrink-0">Auto</span>
                          )}
                          {sub.language === 'ckb' && !sub.is_auto && (
                            <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30 flex-shrink-0">کوردی</span>
                          )}
                        </div>
                        <p className="text-xs text-white/50">
                          {sub.media_type === 'tv' ? 'زنجیرە' : 'فیلم'} • ID: {sub.tmdb_id}
                          {sub.season_number && ` • وەرز ${sub.season_number}`}
                          {sub.episode_number && ` • ئەڵقە ${sub.episode_number}`}
                          {sub.label && ` • ${sub.label}`}
                        </p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        {/* Translate to Kurdish button — only for non-ckb subtitles */}
                        {sub.language !== 'ckb' && (
                          <button
                            onClick={() => handleTranslateOne(sub)}
                            disabled={translatingSubs.has(sub.id)}
                            className="p-2 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg hover:bg-amber-500 hover:text-white transition disabled:opacity-50"
                            title="وەرگێڕان بۆ کوردی"
                          >
                            {translatingSubs.has(sub.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                          </button>
                        )}
                        {/* Preview button — for auto subtitles */}
                        {sub.is_auto && (
                          <button
                            onClick={() => setPreviewSub(sub)}
                            className="p-2 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg hover:bg-blue-500 hover:text-white transition"
                            title="پیشاندان"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        {/* Replace button — for auto subtitles */}
                        {sub.is_auto && (
                          <button
                            onClick={() => handleEdit(sub)}
                            className="p-2 bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg hover:bg-cyan-500 hover:text-white transition"
                            title="جێگرتنەوە"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                        {/* Copy URL */}
                        <button
                          onClick={() => {
                            const vttUrl = sub.file_url || subtitleVttPublicUrl(sub.media_type, sub.tmdb_id, sub.season_number, sub.episode_number);
                            navigator.clipboard.writeText(vttUrl).then(() => {
                              setCopiedUrlId(sub.id);
                              setTimeout(() => setCopiedUrlId(null), 2000);
                            });
                          }}
                          className="p-2 bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg hover:bg-cyan-500 hover:text-white transition"
                          title="کۆپیکردنی URL"
                        >
                          {copiedUrlId === sub.id ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                        {/* Edit button — for non-auto or auto */}
                        <button onClick={() => handleEdit(sub)} className="p-2 bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg hover:bg-cyan-500 hover:text-white transition">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {/* Delete */}
                        <button onClick={() => handleDelete(sub.id)} className="p-2 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2">
                      <p className="text-[10px] text-white/30 truncate font-mono" dir="ltr">
                        {sub.file_url || subtitleVttPublicUrl(sub.media_type, sub.tmdb_id, sub.season_number, sub.episode_number)}
                      </p>
                    </div>
                    <p className="text-xs text-white/30 mt-1">{new Date(sub.updated_at).toLocaleDateString('ckb')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {activeTab === 'videos' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
          {/* Left: Search + Video URL Form */}
          <div className="space-y-4 lg:space-y-6 min-w-0">
            <div className="bg-white/5 border border-white/10 p-4 sm:p-6 rounded-3xl backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Search className="w-5 h-5 text-cyan-400" /> گەڕان بۆ بەرهەم</h2>
              <div className="relative group mb-4">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 group-focus-within:text-cyan-400 transition-colors pointer-events-none" />
                <input
                  type="text"
                  dir="auto"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ناوی فیلم یان زنجیرە بنووسە..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-4 pr-12 py-3 text-white focus:outline-none focus:border-cyan-500 focus:bg-black/50 focus:shadow-lg focus:shadow-cyan-500/10 transition-all placeholder-white/40"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {searchResults.slice(0, 10).map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectItem(item)}
                      className={`w-full flex items-center gap-3 p-2 rounded-xl border transition text-right ${selectedItem?.id === item.id ? 'bg-cyan-600/20 border-cyan-500' : 'bg-black/30 border-white/5 hover:bg-white/5'}`}
                    >
                      <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt="" className="w-10 h-14 rounded object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{item.title || item.name}</p>
                        <p className="text-xs text-white/50 flex items-center gap-1">
                          {item.media_type === 'tv' || !item.title ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                          {item.media_type === 'tv' || !item.title ? 'زنجیرە' : 'فیلم'} • ID: {item.id}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedItem && (
              <div className="bg-white/5 border border-white/10 p-4 sm:p-6 rounded-3xl backdrop-blur-xl space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <LinkIcon className="w-5 h-5 text-cyan-400" />
                  URLی ڤیدیۆ
                </h2>

                <div className="bg-black/30 border border-white/5 p-3 rounded-xl">
                  <p className="font-bold text-sm">{selectedItem.title || selectedItem.name}</p>
                  <p className="text-xs text-white/50">
                    {isTv ? 'زنجیرە' : 'فیلم'} • TMDB ID: {selectedItem.id}
                  </p>
                </div>

                {isTv && (
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-sm font-bold text-white/80 mb-1">وەرز</label>
                      <input
                        type="number" min={1}
                        value={videoUrlSeason}
                        onChange={(e) => setVideoUrlSeason(e.target.value ? Number(e.target.value) : '')}
                        placeholder="1"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 sm:px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-white/80 mb-1">ئەڵقە</label>
                      <input
                        type="number" min={1}
                        value={videoUrlEpisode}
                        onChange={(e) => setVideoUrlEpisode(e.target.value ? Number(e.target.value) : '')}
                        placeholder="1"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 sm:px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold text-white/80 mb-1">بژاردەی یەکەم: لینکی ڕاستەوخۆی ڤیدیۆ</label>
                  <input
                    type="url"
                    value={videoUrlInput}
                    onChange={(e) => { setVideoUrlInput(e.target.value); if (e.target.value) { setHasVideoFile(false); setUploadedVideoUrl(''); setUploadProgress(0); } }}
                    placeholder="https://example.com/video.mp4 یان .m3u8"
                    dir="ltr"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-xs text-white/40 mt-1.5">پشتگیری بۆ .mp4، .m3u8، .mkv، .webm و هەموو لینکی ڕاستەوخۆ</p>
                </div>

                <div className="flex items-center justify-center py-1">
                  <span className="text-white/30 font-bold text-sm">یان</span>
                </div>

                <div>
                  <label className="block text-sm font-bold text-white/80 mb-1">بژاردەی دووەم: ڤیدیۆکە لە مۆبایلەکەتەوە هەڵبژێرە (بارکردنی بەشەبەندی)</label>
                  <VideoUpload
                    tmdbId={selectedItem.id}
                    mediaType={isTv ? 'tv' : 'movie'}
                    season={isTv && videoUrlSeason ? Number(videoUrlSeason) : undefined}
                    episode={isTv && videoUrlEpisode ? Number(videoUrlEpisode) : undefined}
                    onUploadComplete={handleVideoUploadComplete}
                    onUploadProgress={handleVideoUploadProgress}
                    onFileSelected={handleVideoFileSelected}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-white/80 mb-1">لیبڵ (ئیختیاری)</label>
                  <input
                    type="text"
                    value={videoUrlLabel}
                    onChange={(e) => setVideoUrlLabel(e.target.value)}
                    placeholder="1080p یان دڵخواز"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  onClick={handleSaveVideoUrl}
                  disabled={savingUrl || (!videoUrlInput.trim() && !hasVideoFile)}
                  className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 py-3.5 rounded-xl font-bold text-white transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingUrl ? 'سەرقاڵ...' : <><Save className="w-5 h-5" /> پاشەکەوتکردن</>}
                </button>
              </div>
            )}
          </div>

          {/* Right: Existing Video URLs List */}
          <div className="bg-white/5 border border-white/10 p-4 sm:p-6 rounded-3xl backdrop-blur-xl min-w-0">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Video className="w-5 h-5 text-cyan-400" /> URLە پاشەکەوتکراوەکان ({videoUrls.length})</h2>
            {videoUrls.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-8">هیچ URLێک پاشەکەوت نەکراوە</p>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {videoUrls.map(vu => (
                  <div key={vu.id} className="bg-black/30 border border-white/5 p-4 rounded-xl">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate flex items-center gap-1.5">
                          {vu.media_type === 'tv' ? <Tv className="w-3.5 h-3.5 text-cyan-400" /> : <Film className="w-3.5 h-3.5 text-cyan-400" />}
                          {videoUrlTitles[`${vu.media_type}-${vu.tmdb_id}`] || `TMDB: ${vu.tmdb_id}`}
                          {vu.season_number && ` • وەرز ${vu.season_number}`}
                          {vu.episode_number && ` • ئەڵقە ${vu.episode_number}`}
                        </p>
                        <p className="text-xs text-white/40 truncate mt-1" dir="ltr">{vu.url}</p>
                        {vu.label && <span className="inline-block mt-1.5 text-[10px] bg-cyan-500/15 text-cyan-400 px-2 py-0.5 rounded font-bold">{vu.label}</span>}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => handleEditVideoUrl(vu)} className="p-2 bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg hover:bg-cyan-500 hover:text-white transition">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteVideoUrl(vu.id)} className="p-2 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-white/30">{new Date(vu.updated_at).toLocaleDateString('ckb')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {activeTab === 'translator' && (
        <ErrorBoundary>
        <div className="max-w-5xl mx-auto">
          <div className="bg-white/5 border border-white/10 p-4 sm:p-6 rounded-3xl backdrop-blur-xl space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Languages className="w-6 h-6 text-cyan-400" />
              <h2 className="text-lg font-bold">وەرگێڕی ژێرنووس بۆ کوردی</h2>
            </div>

            {/* Gemini API Key Input */}
            <div>
              <label className="block text-sm font-bold text-white/80 mb-1.5 flex items-center gap-1.5">
                <KeyIcon className="w-4 h-4 text-cyan-400" />
                کلیلی Gemini API
              </label>
              <input
                type="text"
                value={geminiApiKey}
                onChange={(e) => {
                  const cleaned = sanitizeKey(e.target.value);
                  setGeminiApiKey(cleaned);
                  localStorage.setItem(LS_GEMINI_API_KEY, cleaned);
                }}
                placeholder="AIza..."
                dir="ltr"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500"
              />
              <p className="text-xs text-white/40 mt-1.5">
                کلیلەکە لە وێبگەڕەکەتدا پاشەکەوت دەکرێت — پێویست بە سێرڤەر ناکات
              </p>
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm font-bold text-white/80 mb-2">فایلی ژێرنووس</label>
              <div
                onClick={() => transFileRef.current?.click()}
                className="relative border-2 border-dashed border-white/15 hover:border-cyan-500/50 rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all bg-black/30 hover:bg-black/40 group"
              >
                <input
                  ref={transFileRef}
                  type="file"
                  accept=".srt,.vtt"
                  onChange={handleTransFileUpload}
                  className="hidden"
                />
                {transFileName ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-green-500/20 text-green-400 rounded-xl flex items-center justify-center border border-green-500/30">
                      <FileText className="w-6 h-6" />
                    </div>
                    <p className="text-green-400 font-bold text-sm">{transFileName}</p>
                    <p className="text-white/40 text-xs">کلیک بکە بۆ گۆڕینی فایل</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-cyan-500/20 text-cyan-400 rounded-xl flex items-center justify-center border border-cyan-500/30 group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-white/70 font-bold text-sm">فایلی SRT یان VTT هەڵبژێرە</p>
                    <p className="text-white/40 text-xs">کلیک بکە یان فایلەکە ڕابکێشە</p>
                  </div>
                )}
              </div>
            </div>

            {/* Dual-view table — shown immediately after file upload */}
            {transPairs.length > 0 && (
              <div className="space-y-3">
                {/* Action bar */}
                <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <p className="text-xs font-bold text-cyan-400">
                      {transPairs.length} ژێرنووس — دەستکاری بکە بۆ پێش پاشەکەوتکردن
                    </p>
                  </div>

                  {/* Auto-Translate button */}
                  <button
                    type="button"
                    onClick={handleTranslate}
                    disabled={translating || !transFileContent.trim() || !sanitizeKey(geminiApiKey)}
                    className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 py-2.5 rounded-lg font-bold text-white text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {translating
                      ? (transProgress && transProgress.total > 0
                          ? `وەرگێڕان... ${transProgress.done}/${transProgress.total}`
                          : 'سەرقاڵ...')
                      : <><Languages className="w-4 h-4" /> وەرگێڕانی ئۆتۆماتیکی بۆ کوردی</>}
                  </button>

                  {/* Progress bar + remaining time */}
                  {translating && transProgress && transProgress.total > 0 && (
                    <div className="space-y-1.5">
                      {transRateLimit && transRateLimit.waiting && (
                        <div className="flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-400 text-xs font-bold animate-pulse">
                          <Clock className="w-4 h-4" />
                          <span>تکایە چاوەڕێ بکە... ڕاوەستانی کاتی گووگڵ ({transRateLimit.waitSeconds} چرکە)</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[11px] text-white/50">
                        <span>{transBatchInfo ? `بەش ${transBatchInfo.current}/${transBatchInfo.total}` : ''}</span>
                        <span>{transBatchInfo ? `کاتی ماوە: ~${transBatchInfo.remainingSec}چڕکە` : ''}</span>
                      </div>
                      <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${(transProgress.done / transProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-white/40 text-center">
                    وەرگێڕان دەخاتە خانەکانەوە — پاشان دەتوانیت دەستکاری بکەیت
                  </p>

                  {/* Download + Save buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadTranslated}
                      disabled={transPairs.length === 0}
                      className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/15 py-2.5 rounded-lg font-bold text-white text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download className="w-4 h-4" /> داگرتنی فایل
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveTransSubtitle}
                      disabled={savingTransSubtitle || !selectedItem || !transPairs.some(p => p.translated.trim())}
                      className="flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 py-2.5 rounded-lg font-bold text-white text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingTransSubtitle
                        ? 'پاشەکەوتکردن...'
                        : <><Save className="w-4 h-4" /> پاشەکەوتکردنی ژێرنووس</>}
                    </button>
                  </div>

                  {!selectedItem && (
                    <p className="text-[10px] text-yellow-400/70 text-center">
                      بۆ پاشەکەوتکردن، سەرەتا لە بەشی ژێرنووسەکان بەرهەمێک دیاری بکە
                    </p>
                  )}
                </div>

                {/* Subtitle rows table */}
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {transPairs.map((pair, idx) => (
                    <div
                      key={idx}
                      className="bg-black/30 border border-white/5 rounded-xl overflow-hidden"
                    >
                      <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/5">
                        <span className="text-xs font-black text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">
                          #{pair.index}
                        </span>
                        <span className="text-xs text-white/40 font-mono" dir="ltr">
                          {pair.timestamp}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                        <div className="p-3 border-l border-white/5">
                          <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1">English</p>
                          <p className="text-sm text-white/60 leading-relaxed" dir="ltr">
                            {pair.original}
                          </p>
                        </div>
                        <div className="p-3 bg-cyan-500/5">
                          <p className="text-[10px] font-bold text-cyan-400/60 uppercase tracking-wider mb-1">کوردی</p>
                          <textarea
                            value={pair.translated}
                            onChange={(e) => handleTransPairEdit(idx, e.target.value)}
                            placeholder="وەرگێڕان لێرە بنووسە..."
                            dir="rtl"
                            spellCheck={false}
                            rows={2}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-white text-sm leading-relaxed focus:outline-none focus:border-cyan-500 transition resize-y min-h-[40px]"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state when no file uploaded yet */}
            {transPairs.length === 0 && (
              <div className="text-center py-8 text-white/40 text-sm">
                فایلێک بار بکە بۆ پیشاندانی خشتەی وەرگێڕان
              </div>
            )}
          </div>
        </div>
        </ErrorBoundary>
        )}

        {activeTab === 'reviews' && (
        <ErrorBoundary>
        <div className="max-w-5xl mx-auto">
          <div className="bg-white/5 border border-white/10 p-4 sm:p-6 rounded-3xl backdrop-blur-xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-6 h-6 text-cyan-400" />
                <h2 className="text-lg font-bold">پێداچوونەوە چاوەڕێکراوەکان</h2>
              </div>
              <button
                onClick={loadPendingReviews}
                disabled={reviewsLoading}
                className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-sm hover:bg-white/10 transition"
              >
                {reviewsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 text-cyan-400" />}
                نوێکردنەوە
              </button>
            </div>

            {reviewsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              </div>
            ) : pendingReviews.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-emerald-400/40 mx-auto mb-3" />
                <p className="text-white/50 text-sm">هیچ پێداچوونەوەیەک چاوەڕێ ناکات</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingReviews.map(review => (
                  <div key={review.id} className="bg-black/30 border border-amber-500/20 rounded-2xl p-5">
                    <div className="flex items-start gap-3 mb-3">
                      {review.avatar_url ? (
                        <img src={review.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-black font-black text-sm flex-shrink-0" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                          {(review.username || '؟')[0]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-3.5 h-3.5 text-white/40" />
                            <span className="text-white font-bold text-sm">{review.username || 'بەکارهێنەر'}</span>
                          </div>
                          <span className="text-white/30 text-xs">{new Date(review.created_at).toLocaleDateString('ckb')}</span>
                        </div>
                        <div className="flex items-center gap-0.5 mt-1">
                          {[1, 2, 3, 4, 5].map(n => (
                            <Star
                              key={n}
                              className={`w-3.5 h-3.5 ${n <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-white/15'}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {review.review_text && (
                      <p className="text-white/70 text-sm leading-relaxed mb-4" dir="rtl">
                        {review.review_text}
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 text-xs text-white/40 mb-4">
                      <Film className="w-3.5 h-3.5" />
                      <span>{review.media_type === 'tv' ? 'زنجیرە' : 'فیلم'} • TMDB ID: {review.tmdb_id}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApproveReview(review.id)}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/50 transition-all"
                      >
                        <Check className="w-4 h-4" /> پەسەندکردن
                      </button>
                      <button
                        onClick={() => handleRejectReview(review.id)}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-500 text-white border border-red-400/50 transition-all"
                      >
                        <X className="w-4 h-4" /> ڕەتکردنەوە
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
