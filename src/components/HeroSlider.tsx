import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Star, ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import type { MediaItem } from '@/types';
import { translateSynopsis } from '@/subtitleApi';

const genreMap: Record<number, string> = {
  28: 'ئاکشن', 12: 'سەرکێشی', 16: 'ئەنیمەیشن', 35: 'کۆمیدی', 80: 'تاوانکاری',
  99: 'دۆکیومێنتاری', 18: 'دراما', 10751: 'خێزانی', 14: 'فەنتازیا', 36: 'مێژوویی',
  27: 'ترسناک', 10402: 'موزیک', 9648: 'نھێنی', 10749: 'ڕۆمانسی', 878: 'خەیاڵی زانستی',
  10770: 'فیلمی تەلەفزیۆنی', 53: 'هەستبزوێن', 10752: 'جەنگی', 37: 'وێسترن',
  10759: 'ئاکشن و سەرکێشی', 10765: 'خەیاڵی و فەنتازیا', 10768: 'جەنگی و سیاسەت'
};

interface HeroSliderProps {
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
}

export default function HeroSlider({ items, onSelect }: HeroSliderProps) {
  const safeItems = items || [];
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [translatedOverviews, setTranslatedOverviews] = useState<Record<number, string>>({});

  const next = useCallback(() => {
    setCurrent(c => (c + 1) % Math.max(safeItems.length, 1));
  }, [safeItems.length]);

  const prev = useCallback(() => {
    setCurrent(c => (c - 1 + safeItems.length) % Math.max(safeItems.length, 1));
  }, [safeItems.length]);

  useEffect(() => {
    if (isPaused || safeItems.length <= 1) return;
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [isPaused, safeItems.length, next]);

  useEffect(() => {
    let cancelled = false;
    safeItems.forEach(async (slideItem) => {
      if (translatedOverviews[slideItem.id]) return;
      if (!slideItem.overview) return;
      const translated = await translateSynopsis(slideItem.overview);
      if (!cancelled && translated) {
        setTranslatedOverviews(prev => ({ ...prev, [slideItem.id]: translated }));
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeItems.map(i => i.id).join(',')]);

  if (safeItems.length === 0) return null;

  const item = safeItems[current % safeItems.length];
  const title = item.title || item.name || '';
  const year = (item.release_date || item.first_air_date)?.substring(0, 4) || '';
  const topGenres = (item.genre_ids || []).slice(0, 3).map(id => genreMap[id] || '').filter(Boolean);
  const overview = translatedOverviews[item.id] || 'وەرگێڕانی کورتە...';

  return (
    <div
      className="relative w-full h-[55vh] lg:h-[75vh] overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Backdrop image with fast crossfade */}
      <AnimatePresence mode="popLayout">
        {safeItems.slice(0, 5).map((slideItem, idx) => (
          <motion.div
            key={slideItem.id}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: idx === current ? 1 : 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <img
              src={`https://image.tmdb.org/t/p/original${slideItem.backdrop_path || slideItem.poster_path}`}
              alt={slideItem.title || slideItem.name || ''}
              className="w-full h-full object-cover"
              style={{ filter: 'brightness(0.5)' }}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-[#0d0e12]/40 to-transparent"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-[#08080a]/90 via-[#0d0e12]/30 to-transparent"></div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={item.id}
          className="absolute inset-0 flex flex-col justify-end p-6 lg:p-12 z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <div className="max-w-2xl">
            {/* Header badge */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className="flex items-center gap-1.5 px-3 py-1 rounded-full border"
                style={{
                  background: 'linear-gradient(to right, rgba(var(--accent-rgb), 0.2), rgba(var(--accent-rgb), 0.1))',
                  borderColor: 'rgba(var(--accent-rgb), 0.3)',
                }}
              >
                <Flame className="w-4 h-4 accent-text" />
                <span className="accent-text text-xs font-bold">باشترینەکانی هەفتە</span>
              </div>
            </div>

            <h2 className="text-3xl lg:text-5xl font-black text-white mb-3 tracking-tight leading-tight">
              {title}
            </h2>

            <div className="flex flex-wrap items-center gap-2.5 mb-4">
              {item.vote_average != null && (
                <span
                  className="flex items-center gap-1.5 accent-text px-3 py-1.5 rounded-lg font-bold text-sm border"
                  style={{
                    background: 'rgba(var(--accent-rgb), 0.15)',
                    borderColor: 'rgba(var(--accent-rgb), 0.25)',
                  }}
                >
                  <Star className="w-4 h-4 accent-fill" />
                  {item.vote_average.toFixed(1)}
                </span>
              )}
              {year && (
                <span className="text-white/80 text-sm font-bold bg-white/10 px-3 py-1.5 rounded-lg border border-white/10">
                  {year}
                </span>
              )}
              {topGenres.map((g, i) => (
                <span
                  key={i}
                  className="text-white/70 text-xs font-medium px-2.5 py-1.5 rounded-lg border"
                  style={{
                    background: 'rgba(var(--accent-rgb), 0.1)',
                    borderColor: 'rgba(var(--accent-rgb), 0.2)',
                  }}
                >
                  {g}
                </span>
              ))}
            </div>

            <p className="text-white/70 leading-relaxed text-sm lg:text-base mb-5 line-clamp-2 max-w-xl" dir="rtl">
              {overview}
            </p>

            <button
              onClick={() => onSelect(item)}
              className="group flex items-center gap-2 font-bold px-6 py-3 rounded-xl transition-all duration-300 text-black hover:scale-105"
              style={{
                background: 'linear-gradient(to right, var(--accent-base), var(--accent-deep))',
                boxShadow: '0 4px 20px rgba(var(--accent-rgb), 0.3)',
              }}
            >
              <Play className="w-5 h-5 fill-black group-hover:scale-110 transition-transform" />
              سەیرکردن
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation arrows */}
      <button
        onClick={prev}
        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white/70 transition-all duration-300 hover:text-white"
        style={{ border: '1px solid rgba(var(--accent-rgb), 0.2)' }}
        aria-label="پێشوو"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={next}
        className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white/70 transition-all duration-300 hover:text-white"
        style={{ border: '1px solid rgba(var(--accent-rgb), 0.2)' }}
        aria-label="دواتر"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Indicators */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {safeItems.slice(0, 5).map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrent(idx)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              idx === current ? 'w-8' : 'w-1.5 bg-white/30 hover:bg-white/50'
            }`}
            style={idx === current ? { background: 'var(--accent-bright)' } : undefined}
            aria-label={`سلاید ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
