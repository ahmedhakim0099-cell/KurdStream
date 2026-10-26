import { useState, useEffect, useMemo } from 'react';
import { Palette, Check, Film, Sparkles, X, Search } from 'lucide-react';
import {
  PALETTES, CATEGORIES, PALETTE_MAP,
  CINEMATIC_THEMES,
  getStoredPalette, getStoredCinematic,
  setPalette, setCinematic,
  type CinematicKey,
} from '@/accentTheme';

export default function AccentPicker() {
  const [open, setOpen] = useState(false);
  const [currentPalette, setCurrentPalette] = useState('obsidian-gold');
  const [cineCurrent, setCineCurrent] = useState<CinematicKey | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('هەموو');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setCurrentPalette(getStoredPalette());
    setCineCurrent(getStoredCinematic());
    const onPaletteChange = (e: Event) => setCurrentPalette((e as CustomEvent<string>).detail);
    const onCineChange = (e: Event) => setCineCurrent((e as CustomEvent<CinematicKey | null>).detail);
    window.addEventListener('palette-change', onPaletteChange);
    window.addEventListener('cinema-change', onCineChange);
    return () => {
      window.removeEventListener('palette-change', onPaletteChange);
      window.removeEventListener('cinema-change', onCineChange);
    };
  }, []);

  const cineKeys = Object.keys(CINEMATIC_THEMES) as CinematicKey[];

  const filteredPalettes = useMemo(() => {
    let list = PALETTES;
    if (activeCategory !== 'هەموو') {
      list = list.filter(p => p.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p => p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q));
    }
    return list;
  }, [activeCategory, search]);

  const tabs = ['هەموو', ...CATEGORIES];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-white/40 hover:text-white text-xs font-medium transition px-3 py-2 rounded-lg hover:bg-white/5"
        title="ڕووکار و ڕەنگ"
      >
        <Palette className="w-4 h-4" />
        <span className="hidden sm:inline">ڕووکار</span>
        <span
          className="w-4 h-4 rounded-full border-2 border-white/20 flex-shrink-0"
          style={{ backgroundColor: PALETTE_MAP[currentPalette]?.accent || '#eab308' }}
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[#0d0e12]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl w-full max-w-[560px] max-h-[88vh] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 left-4 p-1.5 text-white/40 hover:text-white bg-white/5 rounded-lg transition z-10"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Title */}
            <div className="flex items-center gap-2 mb-4 pr-8">
              <Palette className="w-5 h-5 accent-text" />
              <h2 className="text-lg font-black text-white">ڕووکار و ڕەنگ</h2>
              <span className="text-white/30 text-xs font-bold mr-1">({PALETTES.length} پاڵێت)</span>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="گەڕان بۆ ڕەنگ..."
                dir="rtl"
                className="w-full bg-black/40 border border-white/10 rounded-xl pr-10 pl-4 py-2.5 text-white text-sm focus:outline-none transition"
                onFocus={(e) => { e.target.style.borderColor = 'var(--accent-base)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
            </div>

            {/* Category tabs */}
            <div className="flex gap-1.5 mb-4 overflow-x-auto scrollbar-hide pb-1">
              {tabs.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                    activeCategory === cat
                      ? 'text-black'
                      : 'text-white/50 bg-white/5 hover:bg-white/10'
                  }`}
                  style={activeCategory === cat ? { background: 'linear-gradient(135deg, var(--accent-base), var(--accent-deep))' } : undefined}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Palette grid */}
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5 mb-5">
              {filteredPalettes.map(p => {
                const isActive = p.key === currentPalette && !cineCurrent;
                return (
                  <button
                    key={p.key}
                    onClick={() => { setCinematic(null); setPalette(p.key); setCurrentPalette(p.key); setCineCurrent(null); }}
                    className="group relative rounded-xl border-2 transition-all hover:scale-105 flex flex-col items-center justify-center gap-1 p-2 overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${p.bgPrimary} 0%, ${p.bgSecondary} 100%)`,
                      borderColor: isActive ? p.accent : 'rgba(255,255,255,0.06)',
                      boxShadow: isActive ? `0 0 12px ${p.accent}80` : 'none',
                    }}
                    title={p.label}
                  >
                    {/* Accent color dot */}
                    <div
                      className="w-7 h-7 rounded-full border-2 border-white/10 flex-shrink-0"
                      style={{ backgroundColor: p.accent }}
                    />
                    {/* Label */}
                    <span className="text-white/60 text-[9px] font-bold text-center leading-tight truncate w-full">
                      {p.label}
                    </span>
                    {isActive && (
                      <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: p.accent }}>
                        <Check className="w-2.5 h-2.5 text-black" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {filteredPalettes.length === 0 && (
              <p className="text-center text-white/30 text-sm py-6">هیچ پاڵێتێک نەدۆزرایەوە</p>
            )}

            {/* Cinematic Themes divider */}
            <div className="border-t border-white/10 pt-4">
              <p className="text-white/40 text-[10px] font-bold mb-3 px-1 uppercase tracking-wider flex items-center gap-1">
                <Film className="w-3 h-3" /> ڕووکارە سینەماییەکان
              </p>
              <div className="space-y-2">
                {cineKeys.map(key => {
                  const theme = CINEMATIC_THEMES[key];
                  const isActive = key === cineCurrent;
                  return (
                    <button
                      key={key}
                      onClick={() => { setCinematic(key); setCineCurrent(key); setOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-right ${
                        isActive
                          ? 'bg-white/10 border-white/30'
                          : 'bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20'
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center border"
                        style={{
                          background: theme.bgGradient,
                          borderColor: 'rgba(255,255,255,0.15)',
                        }}
                      >
                        {theme.particleType !== 'none' && <Sparkles className="w-3.5 h-3.5" style={{ color: theme.particleColor }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-bold truncate">{theme.label}</p>
                        <p className="text-white/40 text-[10px] truncate">{theme.description}</p>
                      </div>
                      {isActive && <Check className="w-4 h-4 text-white flex-shrink-0" />}
                    </button>
                  );
                })}

                {/* Reset to default */}
                {cineCurrent && (
                  <button
                    onClick={() => { setCinematic(null); setCineCurrent(null); setPalette('obsidian-gold'); setCurrentPalette('obsidian-gold'); }}
                    className="w-full text-center text-white/40 hover:text-white/70 text-[10px] font-bold py-1.5 transition"
                  >
                    ڕێکخستنەوە بۆ بنەڕەت
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
