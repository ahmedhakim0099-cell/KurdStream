import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Send, Sparkles, Play, Loader2 } from 'lucide-react';
import type { MediaItem } from '@/types';

interface AIBotProps {
  open: boolean;
  onClose: () => void;
  allMovies: MediaItem[];
  onSelect: (item: MediaItem) => void;
}

interface Message {
  role: 'user' | 'bot';
  text: string;
  results?: MediaItem[];
}

// Kurdish keyword → genre/theme mapping for matching
const KEYWORD_MAP: { keywords: string[]; genres: number[]; titleHints: string[] }[] = [
  { keywords: ['زیندان', 'هەڵات', 'زاندان', 'هەڵاتن'], genres: [80, 18, 53], titleHints: ['shawshank', 'escape', 'prison'] },
  { keywords: ['کۆمیدی', 'خۆش', 'پێکەنین', 'خۆشە'], genres: [35], titleHints: ['comedy', 'funny'] },
  { keywords: ['ئاکشن', 'شەڕ', 'جەنگ', 'جەنگی', 'هێرش'], genres: [28, 10752, 12], titleHints: ['action', 'war', 'battle'] },
  { keywords: ['ترس', 'ترسناک', 'دەروێ', 'هۆکار'], genres: [27, 9648, 53], titleHints: ['horror', 'scary', 'terror'] },
  { keywords: ['خۆشەویستی', 'ڕۆمانسی', 'عاشق', 'عەشق'], genres: [10749, 18], titleHints: ['love', 'romance', 'romantic'] },
  { keywords: ['زانستی', 'خەیاڵی', 'ئەژدیها', 'بۆشایی'], genres: [878, 14, 12], titleHints: ['sci', 'space', 'fiction', 'fantasy'] },
  { keywords: ['ئەنیمێ', 'ئەنیمەیشن', 'کارتۆن', 'ئەنیم'], genres: [16], titleHints: ['anime', 'animation'] },
  { keywords: ['دراما', 'ژیان', 'کۆمەڵگا'], genres: [18], titleHints: ['drama', 'life'] },
  { keywords: ['نھێنی', 'تاوان', 'لێکۆڵین', 'قەتل'], genres: [80, 9648, 53], titleHints: ['mystery', 'crime', 'detective', 'murder'] },
  { keywords: ['خێزان', 'منداڵ', 'منداڵان'], genres: [10751, 16], titleHints: ['family', 'kids', 'children'] },
  { keywords: ['موزیک', 'گۆرانی', 'ئاواز'], genres: [10402], titleHints: ['music', 'musical'] },
  { keywords: ['دۆکیومێنتاری', 'ڕاستی', 'ڕووداو'], genres: [99], titleHints: ['documentary'] },
  { keywords: ['هیڵۆکۆست', 'جەنگی جیهانی', 'نازی'], genres: [18, 10752, 36], titleHints: ['holocaust', 'war', 'nazi', 'schindler'] },
  { keywords: ['سوپەرهیرۆ', 'پاڵەوان', 'باڵدار'], genres: [28, 878, 12], titleHints: ['superhero', 'hero', 'batman', 'spider', 'avengers'] },
  // Rags-to-riches / wealth / success
  { keywords: ['هەژار', 'دەوڵەمەند', 'بەهرە', 'سەرکەوتن', 'خۆشگەڕ', 'سەرمایە', 'پارە', 'دەوڵەت'], genres: [18, 35], titleHints: ['pursuit', 'happyness', 'slumdog', 'wolf', 'wall', 'street', 'rich', 'wealth', 'success', 'money', 'fortune', 'millionaire', 'rags'] },
  // Revenge / justice
  { keywords: ['تۆڵە', 'تاوانی', 'دادگەری', 'یاسا'], genres: [80, 18, 53], titleHints: ['revenge', 'vengeance', 'justice', 'vendetta'] },
  // Sports / competition
  { keywords: ['وەرزش', 'یاری', 'پێشبڕکێ', 'بوکس'], genres: [18, 35], titleHints: ['sport', 'boxing', 'football', 'race', 'competition', 'rocky', 'fighter'] },
  // War / military
  { keywords: ['سەرباز', 'ئەرتش', 'جەنگی جیهانی'], genres: [10752, 18, 36], titleHints: ['war', 'soldier', 'army', 'military', 'battle'] },
  // Mind / psychology / twist
  { keywords: ['مێشک', 'دەروون', 'هوشیار', 'ئاڵۆز'], genres: [9648, 18, 53], titleHints: ['mind', 'psycholog', 'twist', 'memory', 'dream'] },
];

function analyzeQuery(query: string, allMovies: MediaItem[]): MediaItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  // Find matching keyword categories
  const matchedGenres = new Set<number>();
  const matchedHints: string[] = [];

  KEYWORD_MAP.forEach(cat => {
    cat.keywords.forEach(kw => {
      if (normalized.includes(kw)) {
        cat.genres.forEach(g => matchedGenres.add(g));
        matchedHints.push(...cat.titleHints);
      }
    });
  });

  // Also try direct English keyword matching in titles/overviews
  const englishWords = normalized.match(/[a-z]+/g) || [];
  englishWords.forEach(w => {
    if (w.length >= 3) matchedHints.push(w);
  });

  if (matchedGenres.size === 0 && matchedHints.length === 0) {
    // Fallback: return popular movies
    return allMovies.slice(0, 6);
  }

  // Score each movie
  const scored = allMovies.map(m => {
    let score = 0;
    const genres = m.genre_ids || [];
    matchedGenres.forEach(g => {
      if (genres.includes(g)) score += 2;
    });
    const title = (m.title || m.name || '').toLowerCase();
    const overview = (m.overview || '').toLowerCase();
    matchedHints.forEach(hint => {
      if (title.includes(hint)) score += 3;
      if (overview.includes(hint)) score += 1;
    });
    return { m, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(s => s.m);
}

export default function AIBot({ open, onClose, allMovies, onSelect }: AIBotProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', text: 'بەخێربێیت! من دۆزەرەوەی فیلمم بە ژیریی دەستکرد. جۆرە فیلمێک بنووسە بۆت دەدۆزمەتەوە. بۆ نموونە: "فیلمێکی ئاکشن و جەنگی" یان "فیلمێکی کۆمیدی و خۆش"' },
  ]);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setThinking(true);

    setTimeout(() => {
      const results = analyzeQuery(text, allMovies);
      const botText = results.length > 0
        ? `بەپێی وەسفەکەت ئەم ${results.length} فیلمم دۆزیەوە. پێدەچێت حەزت لێیان بێت:`
        : 'ببورە، فیلمێک بەو وەسفەم نەدۆزیەوە. هەوڵبدە بە وشەی جیاوازتر بنووسیت.';
      setMessages(prev => [...prev, { role: 'bot', text: botText, results }]);
      setThinking(false);
    }, 800);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', duration: 0.35 }}
            className="relative w-full max-w-lg h-[600px] max-h-[85vh] bg-[#0d0e12]/95 backdrop-blur-2xl rounded-3xl border shadow-2xl flex flex-col overflow-hidden"
            style={{ borderColor: 'rgba(var(--accent-rgb), 0.2)' }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between p-5 border-b"
              style={{ borderColor: 'rgba(var(--accent-rgb), 0.1)', background: 'rgba(var(--accent-rgb), 0.05)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-black"
                  style={{ background: 'linear-gradient(135deg, var(--accent-bright), var(--accent-deep))' }}
                >
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-white text-lg flex items-center gap-1.5">
                    دۆزەرەوەی فیلم <Sparkles className="w-4 h-4 accent-text" />
                  </h3>
                  <p className="text-white/40 text-xs">بە ژیریی دەستکرد</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 text-white/50 hover:text-white bg-white/5 rounded-full transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-2' : ''}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm ${msg.role === 'user'
                        ? 'bg-white/10 text-white'
                        : 'text-white'
                      }`}
                      style={msg.role === 'bot' ? {
                        background: 'rgba(var(--accent-rgb), 0.12)',
                        border: '1px solid rgba(var(--accent-rgb), 0.2)',
                      } : undefined}
                    >
                      {msg.text}
                    </div>
                    {/* Movie results */}
                    {msg.results && msg.results.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {msg.results.map(m => (
                          <button
                            key={m.id}
                            onClick={() => { onSelect(m); onClose(); }}
                            className="group relative rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all hover:scale-105"
                          >
                            <img
                              src={`https://image.tmdb.org/t/p/w200${m.poster_path}`}
                              alt={m.title || m.name}
                              className="w-full aspect-[2/3] object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end p-1.5">
                              <p className="text-white text-[10px] font-bold truncate">{m.title || m.name}</p>
                              <div className="flex items-center gap-1 accent-text text-[9px] font-bold">
                                <Play className="w-2.5 h-2.5 fill-current" /> سەیرکردن
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {thinking && (
                <div className="flex justify-end">
                  <div
                    className="rounded-2xl px-4 py-3 text-sm flex items-center gap-2 accent-text"
                    style={{ background: 'rgba(var(--accent-rgb), 0.12)', border: '1px solid rgba(var(--accent-rgb), 0.2)' }}
                  >
                    <Loader2 className="w-4 h-4 animate-spin" /> بیردەکەمەوە...
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t" style={{ borderColor: 'rgba(var(--accent-rgb), 0.1)' }}>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  dir="auto"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                  placeholder="جۆرە فیلمێک بنووسە..."
                  className="flex-1 bg-white/5 border border-white/10 text-white rounded-2xl py-3 px-4 focus:outline-none transition-all text-sm"
                  style={{ outlineColor: 'var(--accent-base)' }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent-base)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                />
                <button
                  onClick={handleSend}
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-black transition-all hover:scale-105 flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--accent-base), var(--accent-deep))' }}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
