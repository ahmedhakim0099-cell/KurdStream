import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, Camera, Edit3, Save, Clock, Film, Tv, Star,
  Heart, Bookmark, CheckCircle2, Calendar,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useUserLists, useWatchProgress } from '@/lib/userData';
import type { MediaItem } from '@/types';

interface ProfilePageProps {
  open: boolean;
  onClose: () => void;
  onSelectItem: (item: MediaItem) => void;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '٠ خولەک';
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} کاتژمێر و ${minutes} خولەک`;
  return `${minutes} خولەک`;
}

export default function ProfilePage({ open, onClose, onSelectItem }: ProfilePageProps) {
  const { user, profile, updateProfile, signOut } = useAuth();
  const { lists } = useUserLists(user?.id || null);
  const { watchStats, progress } = useWatchProgress(user?.id || null);

  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [activeList, setActiveList] = useState<'watched_movies' | 'watched_tv' | 'favorites' | 'watch_later'>('watched_movies');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('قەبارەی وێنەکە نابێت لە ٢ مێگابایت گەورەتر بێت');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setAvatarUrl(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({
      username: username.trim(),
      bio: bio.trim(),
      avatar_url: avatarUrl.trim() || null,
    });
    setSaving(false);
    setEditing(false);
  };

  const watchedMovies = lists.filter(l => l.list_type === 'watched' && l.media_type === 'movie');
  const watchedSeries = lists.filter(l => l.list_type === 'watched' && l.media_type === 'tv');

  const listItems = activeList === 'watched_movies' ? watchedMovies
    : activeList === 'watched_tv' ? watchedSeries
    : lists.filter(l => l.list_type === activeList);

  const listTabs = [
    { key: 'watched_movies' as const, label: 'فیلمە بینراوەکان', icon: Film, count: watchedMovies.length },
    { key: 'watched_tv' as const, label: 'زنجیرە بینراوەکان', icon: Tv, count: watchedSeries.length },
    { key: 'favorites' as const, label: 'دڵخوازەکان', icon: Heart, count: lists.filter(l => l.list_type === 'favorites').length },
    { key: 'watch_later' as const, label: 'بینینی دواتر', icon: Bookmark, count: lists.filter(l => l.list_type === 'watch_later').length },
  ];

  // Accurate watch time from runtime metadata of watched items
  const movieWatchMinutes = watchedMovies.reduce((sum, l) => sum + (Number(l.runtime) || 0), 0);
  const tvWatchMinutes = watchedSeries.reduce((sum, l) => sum + (Number(l.runtime) || 0), 0);

  const handleListItemClick = (item: typeof listItems[0]) => {
    const mediaItem: MediaItem = {
      id: item.tmdb_id,
      title: item.media_type === 'movie' ? item.title : undefined,
      name: item.media_type === 'tv' ? item.title : undefined,
      poster_path: item.poster_path,
      overview: '',
      media_type: item.media_type,
    };
    onSelectItem(mediaItem);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-[#08080a] overflow-y-auto"
        >
          {/* Header bar */}
          <div className="sticky top-0 z-10 bg-[#0d0e12]/90 backdrop-blur-xl border-b flex items-center justify-between px-6 py-4" style={{ borderColor: 'rgba(var(--accent-rgb), 0.1)' }}>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <User className="w-6 h-6 accent-text" /> هەژماری من
            </h1>
            <button onClick={onClose} className="p-2 text-white/50 hover:text-white bg-white/5 rounded-full transition">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="max-w-4xl mx-auto px-6 py-8">
            {/* Profile card */}
            <div
              className="rounded-3xl border p-8 mb-8"
              style={{ borderColor: 'rgba(var(--accent-rgb), 0.15)', background: 'rgba(var(--accent-rgb), 0.05)' }}
            >
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Avatar */}
                <div className="relative">
                  {avatarUrl || profile?.avatar_url ? (
                    <img
                      src={editing ? avatarUrl : profile?.avatar_url || ''}
                      alt={profile?.username}
                      className="w-28 h-28 rounded-full object-cover border-4"
                      style={{ borderColor: 'var(--accent-base)' }}
                    />
                  ) : (
                    <div
                      className="w-28 h-28 rounded-full flex items-center justify-center text-4xl font-black text-black"
                      style={{ background: 'linear-gradient(135deg, var(--accent-base), var(--accent-deep))' }}
                    >
                      {(profile?.username || '؟')[0]}
                    </div>
                  )}
                  {editing && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-0 right-0 bg-white/10 rounded-full p-2 backdrop-blur-md hover:bg-white/20 transition"
                      title="بارکردنی وێنە"
                    >
                      <Camera className="w-5 h-5 text-white" />
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 text-center sm:text-right">
                  {editing ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="ناوی بەکارهێنەر"
                        className="w-full bg-white/5 border border-white/10 text-white rounded-xl py-2.5 px-4 focus:outline-none text-sm"
                        onFocus={(e) => { e.target.style.borderColor = 'var(--accent-base)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                      />
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="ڕەوانە کورتەیەک دەربارەی خۆت بنووسە..."
                        rows={2}
                        className="w-full bg-white/5 border border-white/10 text-white rounded-xl py-2.5 px-4 focus:outline-none text-sm resize-none"
                        onFocus={(e) => { e.target.style.borderColor = 'var(--accent-base)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white rounded-xl py-2.5 px-4 focus:outline-none text-sm hover:bg-white/10 transition"
                      >
                        <Camera className="w-4 h-4" /> بارکردنی وێنە لە ئامێرەکەت
                      </button>
                      {avatarUrl && (
                        <p className="text-white/30 text-xs text-center">وێنە هەڵبژێردرا</p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-2xl font-black text-white mb-1">{profile?.username || 'بەکارهێنەر'}</h2>
                      <p className="text-white/50 text-sm mb-2">{user?.email}</p>
                      {profile?.bio && <p className="text-white/70 text-sm leading-relaxed max-w-md">{profile.bio}</p>}
                    </div>
                  )}
                </div>

                {/* Edit/Save buttons */}
                <div className="flex flex-col gap-2">
                  {editing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-black text-sm transition-all hover:scale-105"
                        style={{ background: 'linear-gradient(135deg, var(--accent-base), var(--accent-deep))' }}
                      >
                        <Save className="w-4 h-4" /> پاشەکەوت
                      </button>
                      <button onClick={() => setEditing(false)} className="px-5 py-2.5 rounded-xl text-white/60 text-sm bg-white/5 transition">
                        هەڵوەشاندنەوە
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setEditing(true); setUsername(profile?.username || ''); setBio(profile?.bio || ''); setAvatarUrl(profile?.avatar_url || ''); }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm bg-white/5 border border-white/10 transition hover:bg-white/10"
                    >
                      <Edit3 className="w-4 h-4" /> دەستکاری
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Watch Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <div
                className="rounded-2xl border p-6 flex items-center gap-4"
                style={{ borderColor: 'rgba(var(--accent-rgb), 0.1)', background: 'rgba(var(--accent-rgb), 0.03)' }}
              >
                <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(var(--accent-rgb), 0.15)' }}>
                  <Film className="w-7 h-7 accent-text" />
                </div>
                <div>
                  <p className="text-white/50 text-xs font-medium mb-1">کۆی کاتی فیلمە بینراوەکان</p>
                  <p className="text-xl font-black text-white">{formatDuration(movieWatchMinutes * 60)}</p>
                </div>
              </div>
              <div
                className="rounded-2xl border p-6 flex items-center gap-4"
                style={{ borderColor: 'rgba(var(--accent-rgb), 0.1)', background: 'rgba(var(--accent-rgb), 0.03)' }}
              >
                <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(var(--accent-rgb), 0.15)' }}>
                  <Tv className="w-7 h-7 accent-text" />
                </div>
                <div>
                  <p className="text-white/50 text-xs font-medium mb-1">کۆی کاتی زنجیرە بینراوەکان</p>
                  <p className="text-xl font-black text-white">{formatDuration(tvWatchMinutes * 60)}</p>
                </div>
              </div>
            </div>

            {/* Lists tabs */}
            <div className="mb-6">
              <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide">
                {listTabs.map(({ key, label, icon: Icon, count }) => (
                  <button
                    key={key}
                    onClick={() => setActiveList(key)}
                    className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all whitespace-nowrap ${
                      activeList === key ? 'text-black' : 'text-white/60 bg-white/5 hover:bg-white/10'
                    }`}
                    style={activeList === key ? { background: 'linear-gradient(135deg, var(--accent-base), var(--accent-deep))' } : undefined}
                  >
                    <Icon className="w-4 h-4" /> {label}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${activeList === key ? 'bg-black/20' : 'bg-white/10'}`}>{count}</span>
                  </button>
                ))}
              </div>

              {listItems.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-white/30 text-sm">هیچ بەرهەمێک لەم لیستەدا نییە</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {listItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleListItemClick(item)}
                      className="group relative rounded-2xl overflow-hidden border border-white/5 hover:border-white/20 transition-all hover:scale-105"
                    >
                      <img
                        src={`https://image.tmdb.org/t/p/w300${item.poster_path}`}
                        alt={item.title}
                        className="w-full aspect-[2/3] object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end p-3">
                        <p className="text-white text-xs font-bold truncate">{item.title}</p>
                        <p className="text-white/40 text-[10px]">{item.media_type === 'movie' ? 'فیلم' : 'زنجیرە'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sign out */}
            <div className="text-center pt-8 border-t" style={{ borderColor: 'rgba(var(--accent-rgb), 0.1)' }}>
              <button
                onClick={async () => { await signOut(); onClose(); }}
                className="text-red-400/70 hover:text-red-400 text-sm font-medium transition"
              >
                دەرچوون لە هەژمار
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
