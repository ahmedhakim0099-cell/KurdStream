import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Loader2, Subtitles, AlertCircle, Play, Pause, Volume2, VolumeX, Maximize, Sparkles } from 'lucide-react';

interface SubtitleTrack {
  file: string;
  label: string;
  lang: string;
}

interface NovaPlayerProps {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  kurdishVttUrl: string | null;
  onFailed: () => void;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export default function NovaPlayer({ tmdbId, mediaType, season, episode, kurdishVttUrl, onFailed }: NovaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const blobUrlsRef = useRef<string[]>([]);

  const [status, setStatus] = useState<'loading' | 'playing' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [quality, setQuality] = useState('');
  const [tracks, setTracks] = useState<SubtitleTrack[]>([]);
  const [activeTrackIdx, setActiveTrackIdx] = useState(-1);
  const [showTrackMenu, setShowTrackMenu] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showFallbackHint, setShowFallbackHint] = useState(false);
  const [autoTranslating, setAutoTranslating] = useState(false);
  const [autoTransProgress, setAutoTransProgress] = useState(0);
  const [autoTransError, setAutoTransError] = useState('');

  const addBlobTrack = useCallback((vttText: string, label: string, lang: string, isDefault: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    const blobUrl = URL.createObjectURL(new Blob([vttText], { type: 'text/vtt' }));
    blobUrlsRef.current.push(blobUrl);
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = label;
    track.srclang = lang;
    track.src = blobUrl;
    if (isDefault) track.default = true;
    video.appendChild(track);
  }, []);

  const handleAutoTranslate = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    setAutoTranslating(true);
    setAutoTransError('');
    setAutoTransProgress(0);
    setShowTrackMenu(false);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/translate-subtitle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          tmdb_id: tmdbId,
          media_type: mediaType,
          season_number: season,
          episode_number: episode,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.cached) setAutoTransProgress(100);
      if (!data.file_url) throw new Error('No file_url returned');

      setAutoTransProgress(50);
      const vttRes = await fetch(data.file_url);
      if (!vttRes.ok) throw new Error('Failed to fetch translated VTT');
      const vttText = await vttRes.text();
      setAutoTransProgress(100);

      addBlobTrack(vttText, 'کوردی (سۆرانی)', 'ku', false);

      const onLoaded = () => {
        const ku = Array.from(video.textTracks).find(t => t.label.includes('سۆرانی') && !t.label.includes('سۆرانی'));
        const autoKu = Array.from(video.textTracks).find(t => t.label === 'کوردی (سۆرانی)');
        const target = autoKu || ku;
        if (target) {
          Array.from(video.textTracks).forEach(t => { t.mode = 'disabled'; });
          target.mode = 'showing';
          setActiveTrackIdx(Array.from(video.textTracks).indexOf(target));
        }
      };
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      if (video.readyState >= 1) onLoaded();
    } catch (err) {
      const msg = (err as Error).message || 'هەڵە لە وەرگێڕاندا';
      if (msg.includes('No source subtitle')) {
        setAutoTransError('ژێرنووسێکی سەرچاوە بەردەست نییە بۆ ئەم ڤیدیۆیە');
      } else {
        setAutoTransError(msg);
      }
    } finally {
      setAutoTranslating(false);
    }
  }, [tmdbId, mediaType, season, episode, addBlobTrack]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setErrorMsg('');
    setQuality('');
    setTracks([]);
    setAutoTransError('');

    (async () => {
      try {
        const fnUrl = `${SUPABASE_URL}/functions/v1/resolve-stream?type=${mediaType}&id=${tmdbId}${mediaType === 'tv' ? `&season=${season}&episode=${episode}` : ''}`;
        const res = await fetch(fnUrl, {
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
          },
        });
        const data = await res.json();
        if (cancelled) return;

        if (!data.found) {
          setErrorMsg(data.reason || 'no stream');
          setStatus('error');
          setShowFallbackHint(true);
          setTimeout(() => { if (!cancelled) onFailed(); }, 1500);
          return;
        }

        setQuality(data.quality || '');
        setTracks(data.subtitles || []);
        setStatus('playing');
        setupVideo(data.url, data.playlist, data.subtitles || []);
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(String(e));
        setStatus('error');
        setShowFallbackHint(true);
        setTimeout(() => { if (!cancelled) onFailed(); }, 1500);
      }
    })();

    return () => {
      cancelled = true;
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, [tmdbId, mediaType, season, episode]);

  async function setupVideo(streamUrl: string, playlist: string | undefined, enSubs: SubtitleTrack[]) {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      const src = playlist
        ? URL.createObjectURL(new Blob([playlist], { type: 'application/vnd.apple.mpegurl' }))
        : streamUrl;
      if (playlist) blobUrlsRef.current.push(src);
      video.src = src;
    } else if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      const src = playlist
        ? URL.createObjectURL(new Blob([playlist], { type: 'application/vnd.apple.mpegurl' }))
        : streamUrl;
      if (playlist) blobUrlsRef.current.push(src);
      hls.loadSource(src);
      hls.attachMedia(video);
      let novaFailed = false;
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (d.fatal && !novaFailed) { novaFailed = true; onFailed(); }
      });
    } else {
      setErrorMsg('HLS not supported');
      setStatus('error');
      setShowFallbackHint(true);
      setTimeout(() => onFailed(), 1500);
      return;
    }

    if (kurdishVttUrl) {
      try {
        const vttText = await (await fetch(kurdishVttUrl)).text();
        addBlobTrack(vttText, 'کوردی - سۆرانی', 'ku', true);
      } catch {
        // Subtitle fetch failed — not critical
      }
    }

    for (const sub of enSubs) {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = sub.label;
      track.srclang = sub.lang;
      track.src = sub.file;
      video.appendChild(track);
    }

    const onLoaded = () => {
      const ku = Array.from(video.textTracks).find(t => t.label.includes('کوردی'));
      if (ku) ku.mode = 'showing';
      video.play().catch(() => {});
    };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video || status !== 'playing') return;
    const updateTracks = () => {
      const tts = Array.from(video.textTracks);
      const idx = tts.findIndex(t => t.mode === 'showing');
      setActiveTrackIdx(idx);
    };
    updateTracks();
    const interval = setInterval(updateTracks, 500);
    return () => clearInterval(interval);
  }, [status]);

  function selectTrack(idx: number) {
    const video = videoRef.current;
    if (!video) return;
    const tts = Array.from(video.textTracks);
    tts.forEach((t, i) => { t.mode = i === idx ? 'showing' : 'disabled'; });
    setActiveTrackIdx(idx);
    setShowTrackMenu(false);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play(); else video.pause();
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    if (!video) return;
    const val = Number(e.target.value);
    video.currentTime = val;
    setCurrentTime(val);
  }

  function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else container.requestFullscreen();
  }

  function fmtTime(s: number): string {
    if (!s || isNaN(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  }

  if (status === 'loading') {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="relative w-14 h-14 mx-auto mb-3">
            <div className="absolute inset-0 border-2 border-amber-500/20 rounded-full" />
            <div className="absolute inset-0 border-2 border-transparent border-t-amber-400 rounded-full animate-spin" />
          </div>
          <p className="text-white/80 text-sm font-bold flex items-center gap-2 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            Nova — بەدوای ستریندا...
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="text-center px-6">
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="text-white/70 text-sm font-bold mb-1">Nova — سترین نەدۆزرایەوە</p>
          {showFallbackHint && (
            <p className="text-amber-400/80 text-xs font-bold mt-2" dir="rtl">نۆڤا بەردەست نییە — گەڕایەوە سێرڤەری Main</p>
          )}
          <p className="text-white/30 text-xs font-mono mt-2 break-all" dir="ltr">{errorMsg}</p>
        </div>
      </div>
    );
  }

  const textTracksList = Array.from(videoRef.current?.textTracks || []);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full bg-black group">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => { const v = videoRef.current; if (v) setCurrentTime(v.currentTime); }}
        onLoadedMetadata={() => { const v = videoRef.current; if (v) setDuration(v.duration); }}
        onClick={togglePlay}
      />

      {/* Quality badge */}
      {quality && (
        <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-amber-500/30 z-10">
          <span className="text-amber-400 text-xs font-bold">{quality}</span>
        </div>
      )}

      {/* Auto-translate progress overlay */}
      {autoTranslating && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none">
          <div className="text-center">
            <div className="relative w-14 h-14 mx-auto mb-3">
              <div className="absolute inset-0 border-2 border-amber-500/20 rounded-full" />
              <div className="absolute inset-0 border-2 border-transparent border-t-amber-400 rounded-full animate-spin" />
            </div>
            <p className="text-white/90 text-sm font-bold flex items-center gap-2 justify-center">
              <Sparkles className="w-4 h-4 text-amber-400" />
              ئامادەکردنی ژێرنوسی کوردی... {autoTransProgress > 0 && `${autoTransProgress}%`}
            </p>
          </div>
        </div>
      )}

      {/* Auto-translate error */}
      {autoTransError && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 max-w-md">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span dir="rtl">هەڵە: {autoTransError}</span>
          <button onClick={() => setAutoTransError('')} className="text-red-300/60 hover:text-red-300 ml-1">✕</button>
        </div>
      )}

      {/* Custom controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pt-8 pb-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1.5 rounded-full cursor-pointer mb-2 accent-amber-500"
          style={{ background: `linear-gradient(to right, #f59e0b ${duration ? (currentTime / duration) * 100 : 0}%, rgba(255,255,255,0.2) ${duration ? (currentTime / duration) * 100 : 0}%)` }}
        />
        <div className="flex items-center gap-3">
          <button onClick={togglePlay} className="text-white hover:text-amber-400 transition">
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button onClick={toggleMute} className="text-white hover:text-amber-400 transition">
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <span className="text-white/70 text-xs font-mono">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
          <div className="flex-1" />
          {/* CC / Track selector */}
          <div className="relative">
            <button
              onClick={() => setShowTrackMenu(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition ${activeTrackIdx >= 0 ? 'text-amber-400 bg-amber-500/15' : 'text-white/70 hover:text-amber-400'}`}
            >
              <Subtitles className="w-4 h-4" />
              CC
            </button>
            {showTrackMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur-md border border-white/10 rounded-xl p-1.5 min-w-[200px] shadow-2xl">
                <button
                  onClick={() => selectTrack(-1)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTrackIdx === -1 ? 'text-amber-400 bg-amber-500/15' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                >
                  Off
                </button>
                {textTracksList.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => selectTrack(i)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTrackIdx === i ? 'text-amber-400 bg-amber-500/15' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                  >
                    {t.label}
                  </button>
                ))}
                {/* Auto-translate option */}
                <div className="border-t border-white/10 mt-1 pt-1">
                  <button
                    onClick={handleAutoTranslate}
                    disabled={autoTranslating}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-amber-400 hover:bg-amber-500/15 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {autoTranslating ? `وەرگێڕان... ${autoTransProgress}%` : 'کوردی (سۆرانی)'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={toggleFullscreen} className="text-white hover:text-amber-400 transition">
            <Maximize className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
