import { useState, useRef, useCallback } from 'react';
import { Upload, Video, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import * as tus from 'tus-js-client';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const MAX_FILE_SIZE = 3 * 1024 * 1024 * 1024; // 3GB

interface VideoUploadProps {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  onUploadComplete: (publicUrl: string) => void;
  onUploadProgress?: (percent: number) => void;
  onFileSelected?: (hasFile: boolean) => void;
}

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

export default function VideoUpload({
  tmdbId,
  mediaType,
  season,
  episode,
  onUploadComplete,
  onUploadProgress,
  onFileSelected,
}: VideoUploadProps) {
  const { session } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const uploadRef = useRef<tus.Upload | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const buildPath = useCallback((f: File): string => {
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ts = Date.now();
    if (mediaType === 'tv') {
      const s = season || 1;
      const e = episode || 1;
      return `tv/${tmdbId}/${s}/${e}/${ts}-${safeName}`;
    }
    return `movies/${tmdbId}/${ts}-${safeName}`;
  }, [tmdbId, mediaType, season, episode]);

  const startUpload = useCallback((f: File) => {
    const filePath = buildPath(f);
    setUploadState('uploading');
    setProgress(0);
    setProgressText('');
    setErrorMsg('');

    const upload = new tus.Upload(f, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
        'x-upsert': 'true',
      },
      metadata: {
        bucketName: 'videos',
        objectName: filePath,
        contentType: f.type || 'video/mp4',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (err) => {
        setUploadState('error');
        setErrorMsg(err?.message || 'هەڵە لە بارکردنی فایل');
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const pct = Math.round((bytesUploaded / bytesTotal) * 100);
        const loadedGB = (bytesUploaded / (1024 * 1024 * 1024)).toFixed(2);
        const totalGB = (bytesTotal / (1024 * 1024 * 1024)).toFixed(2);
        setProgress(pct);
        setProgressText(`${pct}% (${loadedGB} GB / ${totalGB} GB)`);
        onUploadProgress?.(pct);
      },
      onSuccess: () => {
        const { data: publicUrlData } = supabase.storage
          .from('videos')
          .getPublicUrl(filePath);

        setProgress(100);
        setProgressText('100%');
        setUploadedUrl(publicUrlData.publicUrl);
        setUploadState('done');
        onUploadProgress?.(100);
        onUploadComplete(publicUrlData.publicUrl);
      },
    });

    uploadRef.current = upload;
    upload.start();
  }, [buildPath, onUploadComplete, onUploadProgress, session]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.type.startsWith('video/') && !/\.(mp4|mkv|webm|avi|mov|m4v)$/i.test(f.name)) {
      setUploadState('error');
      setErrorMsg('تکایە تەنها فایلی ڤیدیۆ هەڵبژێرە');
      onFileSelected?.(false);
      return;
    }

    if (f.size > MAX_FILE_SIZE) {
      setUploadState('error');
      setErrorMsg(`فایلەکە زۆر گەورەیە. سنووری زیاترین 3GB`);
      onFileSelected?.(false);
      return;
    }

    setFile(f);
    setUploadState('idle');
    setProgress(0);
    setProgressText('');
    setUploadedUrl('');
    setErrorMsg('');
    onFileSelected?.(true);
  };

  const handleUploadClick = () => {
    if (!file) return;
    startUpload(file);
  };

  const handleCancel = () => {
    uploadRef.current?.abort(true);
    uploadRef.current = null;
    setUploadState('idle');
    setProgress(0);
    setProgressText('');
    setFile(null);
    setUploadedUrl('');
    setErrorMsg('');
    if (inputRef.current) inputRef.current.value = '';
    onFileSelected?.(false);
  };

  const formatSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mkv,.mp4,.webm,.avi,.mov,.m4v"
        onChange={handleFileChange}
        className="hidden"
      />

      {!file && uploadState !== 'uploading' && (
        <div
          onClick={() => inputRef.current?.click()}
          className="relative border-2 border-dashed border-white/15 hover:border-cyan-500/50 rounded-2xl p-4 text-center cursor-pointer transition-all bg-black/30 hover:bg-black/40 group"
        >
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 bg-cyan-500/20 text-cyan-400 rounded-xl flex items-center justify-center border border-cyan-500/30 group-hover:scale-110 transition-transform">
              <Upload className="w-5 h-5" />
            </div>
            <p className="text-white/70 font-bold text-sm">فایلی ڤیدیۆ هەڵبژێرە لە مۆبایلەکەت</p>
            <p className="text-white/40 text-xs">MP4، MKV، WEBM تا 3GB — بارکردنی بەشەبەندی بۆ کۆگای ناوخۆ</p>
          </div>
        </div>
      )}

      {file && (
        <div className="bg-black/40 border border-white/10 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center border flex-shrink-0 ${
                uploadState === 'done' ? 'bg-green-500/20 text-green-400 border-green-500/30'
                : uploadState === 'error' ? 'bg-red-500/20 text-red-400 border-red-500/30'
                : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
              }`}>
                {uploadState === 'done' ? <CheckCircle className="w-4.5 h-4.5" />
                : uploadState === 'error' ? <AlertCircle className="w-4.5 h-4.5" />
                : <Video className="w-4.5 h-4.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white/90 font-bold text-sm truncate">{file.name}</p>
                <p className="text-white/40 text-xs">{formatSize(file.size)}</p>
              </div>
            </div>
            {uploadState !== 'uploading' && (
              <button
                onClick={handleCancel}
                className="p-1.5 bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 rounded-lg transition flex-shrink-0"
                title="لابردن"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {uploadState === 'idle' && (
            <button
              onClick={handleUploadClick}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 py-2.5 rounded-lg font-bold text-white text-sm transition flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" /> دەستپێکردنی بارکردن
            </button>
          )}

          {uploadState === 'uploading' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  بارکردنی بەشەبەندی...
                </span>
                <span className="text-white/70 font-mono text-xs">{progressText}</span>
              </div>
              <div className="w-full bg-black/50 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-white/30 text-[10px] text-center">ئەگەر ئینتەرنێت بڕۆ، بارکردن لە هەمان شوێن بەردەوام دەبێت</p>
            </div>
          )}

          {uploadState === 'done' && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
              <p className="text-green-400 font-bold text-xs flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                فایل بە سەرکەوتوویی بارکرا
              </p>
              <p className="text-white/30 text-[10px] truncate mt-1" dir="ltr">{uploadedUrl}</p>
            </div>
          )}

          {uploadState === 'error' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <p className="text-red-400 font-bold text-xs flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {errorMsg}
              </p>
              <button
                onClick={handleUploadClick}
                className="text-cyan-400 text-xs hover:underline mt-1.5 font-bold"
              >
                دووبارە هەوڵبدەوە
              </button>
            </div>
          )}
        </div>
      )}

      {errorMsg && !file && (
        <p className="text-red-400 text-xs flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {errorMsg}
        </p>
      )}
    </div>
  );
}
