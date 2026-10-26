import { memo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Play, X, Star, Film, Tv, Heart, Bookmark, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MediaItem } from '@/types';
import { useTrailerPreview } from '@/hooks/useTrailerPreview';

export interface CardContextProps {
  isAdmin: boolean;
  onDelete: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
  isInList: (id: number, list: 'watched' | 'favorites' | 'watch_later') => boolean;
  toggleList: (item: MediaItem, list: 'watched' | 'favorites' | 'watch_later') => void;
  onRequireAuth: () => void;
  hasUser: boolean;
}

interface MediaCardProps extends CardContextProps {
  item: MediaItem;
  rank?: number;
  index: number;
}

function MediaCardImpl({ item, rank, index, isAdmin, onDelete, onSelect, isInList, toggleList, onRequireAuth, hasUser }: MediaCardProps) {
  const isTv = item.media_type === 'tv' || !item.title;
  const year = (item.release_date || item.first_air_date)?.substring(0, 4);
  const fav = isInList(item.id, 'favorites');
  const later = isInList(item.id, 'watch_later');
  const { trailerUrl, onHoverStart, onHoverEnd } = useTrailerPreview(item);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.02, 0.4) }}
      onClick={() => onSelect(item)}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      className="group relative cursor-pointer rounded-xl overflow-hidden border border-white/5 bg-white/5 transition-all duration-300 ease-out hover:scale-[1.08] hover:z-20 flex-shrink-0 w-[112px] sm:w-[130px] md:w-[150px]"
      whileHover={{ boxShadow: `0 0 20px rgba(var(--accent-rgb), 0.3)` }}
    >
      {rank != null && (
        <div className="absolute top-1.5 left-1.5 z-20 font-extrabold w-7 h-7 rounded-full flex items-center justify-center text-black shadow-lg text-xs" style={{ background: 'linear-gradient(135deg, var(--accent-bright), var(--accent-deep))' }}>
          {rank}
        </div>
      )}
      {isAdmin && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item); }}
          className="absolute top-1.5 right-1.5 z-30 w-6 h-6 rounded-full bg-red-600/90 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg"
          title="سڕینەوە"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-white/5">
        <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || item.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
        {item.vote_average != null && item.vote_average > 0 && (
          <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded-md">
            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
            <span className="text-amber-400 font-bold text-[10px]">{item.vote_average.toFixed(1)}</span>
          </div>
        )}
        {rank == null && (
          <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-0.5 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded-md">
            {isTv ? <Tv className="w-2.5 h-2.5 text-cyan-400" /> : <Film className="w-2.5 h-2.5 text-rose-400" />}
            <span className="text-white/80 font-bold text-[8px]">{isTv ? 'زنجیرە' : 'فیلم'}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-transparent to-transparent opacity-80 group-hover:opacity-95 transition-opacity flex flex-col justify-end p-2">
          <h3 className="text-white font-bold text-[11px] sm:text-xs truncate" dir="auto">{item.title || item.name}</h3>
          {year && (
            <span className="text-white/50 text-[9px] flex items-center gap-0.5 mt-0.5">
              <Calendar className="w-2 h-2" />{year}
            </span>
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="p-2.5 rounded-full backdrop-blur-md" style={{ background: 'rgba(var(--accent-rgb), 0.85)' }}>
            <Play className="w-5 h-5 text-black fill-black" />
          </div>
        </div>
        {trailerUrl && (
          <iframe src={trailerUrl} allow="autoplay; encrypted-media" className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ border: 'none' }} title="ترایلەر" />
        )}
        <div className="absolute bottom-1.5 right-1.5 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
          <button onClick={(e) => { e.stopPropagation(); if (!hasUser) { onRequireAuth(); return; } toggleList(item, 'favorites'); }} className={`w-6 h-6 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${fav ? 'bg-rose-500 text-white' : 'bg-black/60 text-white/70 hover:bg-rose-600'}`} title="دڵخواز">
            <Heart className="w-3 h-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); if (!hasUser) { onRequireAuth(); return; } toggleList(item, 'watch_later'); }} className={`w-6 h-6 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${later ? 'bg-amber-500 text-black' : 'bg-black/60 text-white/70 hover:bg-amber-500'}`} title="بینینی دواتر">
            <Bookmark className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export const MediaCard = memo(MediaCardImpl);

export function PosterGrid({ data, showRank, cardProps }: { data: MediaItem[]; showRank?: boolean; cardProps: CardContextProps }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 lg:gap-4">
      {data.map((item, index) => (
        <div key={`${item.id}-${index}`}>
          <MediaCard item={item} rank={showRank ? index + 1 : undefined} index={index} {...cardProps} />
        </div>
      ))}
    </div>
  );
}

export function CarouselRow({ title, icon: Icon, data, onSeeAll, rankStart, cardProps }: {
  title: string;
  icon: any;
  data: MediaItem[];
  onSeeAll?: () => void;
  rankStart?: number;
  cardProps: CardContextProps;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scroll = (dir: number) => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: dir * 500, behavior: 'smooth' });
  };
  if (!data || data.length === 0) return null;
  return (
    <div className="group/row">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base lg:text-xl font-bold border-r-4 pr-2.5 flex items-center gap-1.5" style={{ borderColor: 'var(--accent-base)' }}>
          <Icon className="w-4 h-4 lg:w-5 lg:h-5 accent-text" /> {title}
        </h2>
        <div className="flex items-center gap-2">
          {onSeeAll && (
            <button onClick={onSeeAll} className="text-xs lg:text-sm font-bold transition accent-text hover:underline">بینینی هەمووی</button>
          )}
          <div className="hidden md:flex gap-1">
            <button onClick={() => scroll(-1)} className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 transition">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => scroll(1)} className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 transition">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-2.5 overflow-x-auto pb-3 snap-x scrollbar-hide -mx-2 px-2" style={{ scrollbarWidth: 'none' }}>
        {data.map((item, index) => (
          <div key={`${item.id}-${index}`} className="snap-start">
            <MediaCard item={item} rank={rankStart != null ? rankStart + index : undefined} index={index} {...cardProps} />
          </div>
        ))}
      </div>
    </div>
  );
}
