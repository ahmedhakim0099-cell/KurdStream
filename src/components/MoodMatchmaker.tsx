import { useState, useCallback } from 'react';
import { Sparkles, Heart, Zap, Brain, Laugh, Ghost, Rocket, Droplets, Users, Moon, Play } from 'lucide-react';
import type { MediaItem } from '@/types';
import { corsFetchJson } from '@/lib/corsFetch';

const API_KEY = '7d14dee38d0eb74c7fd96bec8dceefd5';
const BASE_URL = 'https://api.themoviedb.org/3';

interface Mood {
  id: string;
  label: string;
  icon: typeof Heart;
  genreIds: number[];
  emoji: string;
}

const MOODS: Mood[] = [
  { id: 'exciting', label: 'پڕ لە ئاکشن', icon: Zap, genreIds: [28, 53], emoji: '🔥' },
  { id: 'romantic', label: 'ڕۆمانسی', icon: Heart, genreIds: [10749], emoji: '❤️' },
  { id: 'thoughtful', label: 'بیرکردنەوە', icon: Brain, genreIds: [18, 9648], emoji: '🧠' },
  { id: 'funny', label: 'پێکەنینی', icon: Laugh, genreIds: [35], emoji: '😂' },
  { id: 'scary', label: 'ترسناک', icon: Ghost, genreIds: [27, 53], emoji: '👻' },
  { id: 'scifi', label: 'خەیاڵی زانستی', icon: Rocket, genreIds: [878, 14], emoji: '🚀' },
  { id: 'emotional', label: 'هیستی', icon: Droplets, genreIds: [18, 10751], emoji: '😢' },
  { id: 'family', label: 'خێزانی', icon: Users, genreIds: [10751, 16], emoji: '👨‍👩‍👧' },
  { id: 'dark', label: 'تاریک و نھێنی', icon: Moon, genreIds: [80, 9648], emoji: '🌙' },
];

interface MoodMatchmakerProps {
  onSelectItem: (item: MediaItem) => void;
}

export default function MoodMatchmaker({ onSelectItem }: MoodMatchmakerProps) {
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchByMood = useCallback(async (mood: Mood) => {
    setLoading(true);
    setResults([]);
    try {
      const genreParam = mood.genreIds.join(',');
      const [movieRes, tvRes] = await Promise.all([
        corsFetchJson(`${BASE_URL}/discover/movie?api_key=${API_KEY}&include_adult=false&with_genres=${genreParam}&sort_by=popularity.desc&page=1`),
        corsFetchJson(`${BASE_URL}/discover/tv?api_key=${API_KEY}&include_adult=false&with_genres=${genreParam}&sort_by=popularity.desc&page=1`),
      ]);
      const movies: MediaItem[] = (movieRes.results || []).map((m: any) => ({ ...m, media_type: 'movie' }));
      const shows: MediaItem[] = (tvRes.results || []).map((t: any) => ({ ...t, media_type: 'tv' }));
      const combined = [...movies, ...shows]
        .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
        .slice(0, 18);
      setResults(combined);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMoodClick = (mood: Mood) => {
    setSelectedMood(mood);
    fetchByMood(mood);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 accent-text" />
        <h2 className="text-base lg:text-xl font-bold border-r-4 pr-2.5" style={{ borderColor: 'var(--accent-base)' }}>
          چی سەیری بکەم ئەمڕۆ؟
        </h2>
      </div>

      {/* Mood selector pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {MOODS.map(mood => {
          const Icon = mood.icon;
          const isActive = selectedMood?.id === mood.id;
          return (
            <button
              key={mood.id}
              onClick={() => handleMoodClick(mood)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-sm border transition-all ${
                isActive
                  ? 'text-white'
                  : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/90'
              }`}
              style={isActive ? { background: 'rgba(var(--accent-rgb), 0.15)', borderColor: 'rgba(var(--accent-rgb), 0.3)' } : undefined}
            >
              <Icon className="w-4 h-4" />
              {mood.label}
            </button>
          );
        })}
      </div>

      {/* Results */}
      {loading && (
        <div className="flex items-center gap-2 text-white/50 text-sm py-4">
          <div className="w-5 h-5 border-2 border-white/20 border-t-amber-400 rounded-full animate-spin" />
          گەڕان بە پێی ھەستەکەت...
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto pb-3 snap-x scrollbar-hide -mx-2 px-2" style={{ scrollbarWidth: 'none' }}>
          {results.map((item, index) => (
            <div
              key={`${item.id}-${index}`}
              onClick={() => onSelectItem(item)}
              className="group cursor-pointer rounded-xl overflow-hidden border border-white/5 bg-white/5 flex-shrink-0 w-[112px] sm:w-[130px] md:w-[150px] snap-start transition-all hover:scale-105 hover:z-20"
            >
              <div className="relative aspect-[2/3] w-full overflow-hidden bg-white/5">
                <img
                  src={`https://image.tmdb.org/t/p/w342${item.poster_path}`}
                  alt={item.title || item.name}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-transparent to-transparent opacity-80 group-hover:opacity-95 flex flex-col justify-end p-2">
                  <h3 className="text-white font-bold text-[11px] sm:text-xs truncate" dir="auto">{item.title || item.name}</h3>
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <div className="p-2.5 rounded-full backdrop-blur-md" style={{ background: 'rgba(var(--accent-rgb), 0.85)' }}>
                    <Play className="w-5 h-5 text-black fill-black" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
