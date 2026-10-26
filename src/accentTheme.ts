// Dynamic color theme engine — 50+ unique palettes persisted to localStorage
// Each palette sets CSS variables for accent, background, card, and border colors

export interface ColorPalette {
  key: string;
  label: string;
  category: string;
  accent: string;      // primary accent hex
  accentBright: string;
  accentDeep: string;
  accentRgb: string;
  bgPrimary: string;
  bgSecondary: string;
  cardBg: string;
  cardBorder: string;
  glowColor: string;
}

// ── 50+ Unique Color Palettes ──

export const PALETTES: ColorPalette[] = [
  // ── Deep Obsidians (1-6) ──
  { key: 'obsidian-gold', label: 'ئۆبسیدیانی زێڕین', category: 'ئۆبسیدیان',
    accent: '#eab308', accentBright: '#fbbf24', accentDeep: '#a16207', accentRgb: '234,179,8',
    bgPrimary: '#08080a', bgSecondary: '#0d0e12', cardBg: '#12131a', cardBorder: 'rgba(234,179,8,0.12)', glowColor: 'rgba(234,179,8,0.12)' },
  { key: 'obsidian-amber', label: 'ئۆبسیدیانی عەنەبی', category: 'ئۆبسیدیان',
    accent: '#f59e0b', accentBright: '#fbbf24', accentDeep: '#b45309', accentRgb: '245,158,11',
    bgPrimary: '#0a0806', bgSecondary: '#0f0c08', cardBg: '#15110b', cardBorder: 'rgba(245,158,11,0.12)', glowColor: 'rgba(245,158,11,0.12)' },
  { key: 'obsidian-cyan', label: 'ئۆبسیدیانی شین', category: 'ئۆبسیدیان',
    accent: '#06b6d4', accentBright: '#22d3ee', accentDeep: '#0e7490', accentRgb: '6,182,212',
    bgPrimary: '#080a0c', bgSecondary: '#0c1014', cardBg: '#101418', cardBorder: 'rgba(6,182,212,0.12)', glowColor: 'rgba(6,182,212,0.12)' },
  { key: 'obsidian-emerald', label: 'ئۆبسیدیانی سەوز', category: 'ئۆبسیدیان',
    accent: '#10b981', accentBright: '#34d399', accentDeep: '#047857', accentRgb: '16,185,129',
    bgPrimary: '#080a09', bgSecondary: '#0c100e', cardBg: '#101512', cardBorder: 'rgba(16,185,129,0.12)', glowColor: 'rgba(16,185,129,0.12)' },
  { key: 'obsidian-crimson', label: 'ئۆبسیدیانی سوور', category: 'ئۆبسیدیان',
    accent: '#ef4444', accentBright: '#f87171', accentDeep: '#b91c1c', accentRgb: '239,68,68',
    bgPrimary: '#0a0808', bgSecondary: '#0e0c0c', cardBg: '#141111', cardBorder: 'rgba(239,68,68,0.12)', glowColor: 'rgba(239,68,68,0.12)' },
  { key: 'obsidian-rose', label: 'ئۆبسیدیانی گوڵی', category: 'ئۆبسیدیان',
    accent: '#f43f5e', accentBright: '#fb7185', accentDeep: '#be123c', accentRgb: '244,63,94',
    bgPrimary: '#0a0809', bgSecondary: '#0e0c0d', cardBg: '#141112', cardBorder: 'rgba(244,63,94,0.12)', glowColor: 'rgba(244,63,94,0.12)' },

  // ── Cyber-Neon (7-14) ──
  { key: 'cyber-cyan', label: 'سایبەر شین', category: 'سایبەر-نیۆن',
    accent: '#00f0ff', accentBright: '#5eead4', accentDeep: '#0891b2', accentRgb: '0,240,255',
    bgPrimary: '#050810', bgSecondary: '#0a0e18', cardBg: '#0f1420', cardBorder: 'rgba(0,240,255,0.15)', glowColor: 'rgba(0,240,255,0.18)' },
  { key: 'cyber-magenta', label: 'سایبەر مەجەنتا', category: 'سایبەر-نیۆن',
    accent: '#e600ff', accentBright: '#f472ff', accentDeep: '#a21caf', accentRgb: '230,0,255',
    bgPrimary: '#080510', bgSecondary: '#100818', cardBg: '#180c20', cardBorder: 'rgba(230,0,255,0.15)', glowColor: 'rgba(230,0,255,0.18)' },
  { key: 'cyber-lime', label: 'سایبەر لیمۆ', category: 'سایبەر-نیۆن',
    accent: '#a3ff00', accentBright: '#bef264', accentDeep: '#65a30d', accentRgb: '163,255,0',
    bgPrimary: '#080a06', bgSecondary: '#0e1208', cardBg: '#141a0c', cardBorder: 'rgba(163,255,0,0.15)', glowColor: 'rgba(163,255,0,0.18)' },
  { key: 'cyber-orange', label: 'سایبەر نارەنجی', category: 'سایبەر-نیۆن',
    accent: '#ff6b00', accentBright: '#fb923c', accentDeep: '#c2410c', accentRgb: '255,107,0',
    bgPrimary: '#0a0606', bgSecondary: '#100a08', cardBg: '#18120c', cardBorder: 'rgba(255,107,0,0.15)', glowColor: 'rgba(255,107,0,0.18)' },
  { key: 'cyber-violet', label: 'سایبەر مۆر', category: 'سایبەر-نیۆن',
    accent: '#8b5cf6', accentBright: '#a78bfa', accentDeep: '#6d28d9', accentRgb: '139,92,246',
    bgPrimary: '#080610', bgSecondary: '#0c0a16', cardBg: '#120e1e', cardBorder: 'rgba(139,92,246,0.15)', glowColor: 'rgba(139,92,246,0.18)' },
  { key: 'cyber-pink', label: 'سایبەر پەمەی', category: 'سایبەر-نیۆن',
    accent: '#ff2d92', accentBright: '#f9a8d4', accentDeep: '#be185d', accentRgb: '255,45,146',
    bgPrimary: '#0a0610', bgSecondary: '#100818', cardBg: '#180c20', cardBorder: 'rgba(255,45,146,0.15)', glowColor: 'rgba(255,45,146,0.18)' },
  { key: 'cyber-teal', label: 'سایبەر تیڵ', category: 'سایبەر-نیۆن',
    accent: '#2dd4bf', accentBright: '#5eead4', accentDeep: '#0f766e', accentRgb: '45,212,191',
    bgPrimary: '#050a0a', bgSecondary: '#081010', cardBg: '#0c1614', cardBorder: 'rgba(45,212,191,0.15)', glowColor: 'rgba(45,212,191,0.18)' },
  { key: 'cyber-yellow', label: 'سایبەر زەرد', category: 'سایبەر-نیۆن',
    accent: '#fde047', accentBright: '#fef08a', accentDeep: '#ca8a04', accentRgb: '253,224,71',
    bgPrimary: '#0a0a06', bgSecondary: '#101008', cardBg: '#16160c', cardBorder: 'rgba(253,224,71,0.15)', glowColor: 'rgba(253,224,71,0.18)' },

  // ── Royal Golds (15-19) ──
  { key: 'royal-gold', label: 'زێڕی شاهانە', category: 'زێڕی شاهانە',
    accent: '#d4af37', accentBright: '#f0d75e', accentDeep: '#92702a', accentRgb: '212,175,55',
    bgPrimary: '#0a0805', bgSecondary: '#100d08', cardBg: '#161208', cardBorder: 'rgba(212,175,55,0.15)', glowColor: 'rgba(212,175,55,0.15)' },
  { key: 'royal-champagne', label: 'شامپەی شاهانە', category: 'زێڕی شاهانە',
    accent: '#e6c87a', accentBright: '#f0dca0', accentDeep: '#b8975a', accentRgb: '230,200,122',
    bgPrimary: '#0b0906', bgSecondary: '#110e0a', cardBg: '#171410', cardBorder: 'rgba(230,200,122,0.12)', glowColor: 'rgba(230,200,122,0.12)' },
  { key: 'royal-bronze', label: 'بڕۆنزی شاهانە', category: 'زێڕی شاهانە',
    accent: '#cd7f32', accentBright: '#e09955', accentDeep: '#8c5818', accentRgb: '205,127,50',
    bgPrimary: '#0a0705', bgSecondary: '#0f0b07', cardBg: '#15100a', cardBorder: 'rgba(205,127,50,0.12)', glowColor: 'rgba(205,127,50,0.12)' },
  { key: 'royal-platinum', label: 'پلاتینی شاهانە', category: 'زێڕی شاهانە',
    accent: '#c0c4cc', accentBright: '#e5e7eb', accentDeep: '#6b7280', accentRgb: '192,196,204',
    bgPrimary: '#08080a', bgSecondary: '#0d0d10', cardBg: '#121214', cardBorder: 'rgba(192,196,204,0.12)', glowColor: 'rgba(192,196,204,0.1)' },
  { key: 'royal-amber-dark', label: 'عەنەبی تاریک', category: 'زێڕی شاهانە',
    accent: '#b45309', accentBright: '#d97706', accentDeep: '#78350f', accentRgb: '180,83,9',
    bgPrimary: '#0a0703', bgSecondary: '#0f0a05', cardBg: '#15100a', cardBorder: 'rgba(180,83,9,0.12)', glowColor: 'rgba(180,83,9,0.12)' },

  // ── Crimson Darks (20-25) ──
  { key: 'crimson-dark', label: 'سووری تاریک', category: 'سووری تاریک',
    accent: '#dc2626', accentBright: '#ef4444', accentDeep: '#991b1b', accentRgb: '220,38,38',
    bgPrimary: '#0a0405', bgSecondary: '#0e0607', cardBg: '#140a0a', cardBorder: 'rgba(220,38,38,0.12)', glowColor: 'rgba(220,38,38,0.12)' },
  { key: 'crimson-blood', label: 'سووری خوێن', category: 'سووری تاریک',
    accent: '#b91c1c', accentBright: '#dc2626', accentDeep: '#7f1d1d', accentRgb: '185,28,28',
    bgPrimary: '#080404', bgSecondary: '#0c0606', cardBg:'#120808', cardBorder: 'rgba(185,28,28,0.12)', glowColor: 'rgba(185,28,28,0.12)' },
  { key: 'crimson-wine', label: 'سووری شەراب', category: 'سووری تاریک',
    accent: '#9b1c31', accentBright: '#c12d44', accentDeep: '#6b0f1f', accentRgb: '155,28,49',
    bgPrimary: '#080608', bgSecondary: '#0c080a', cardBg: '#120a0e', cardBorder: 'rgba(155,28,49,0.12)', glowColor: 'rgba(155,28,49,0.12)' },
  { key: 'crimson-maroon', label: 'سووری ماروون', category: 'سووری تاریک',
    accent: '#7f1d1d', accentBright: '#991b1b', accentDeep: '#450a0a', accentRgb: '127,29,29',
    bgPrimary: '#060404', bgSecondary: '#0a0606', cardBg: '#100808', cardBorder: 'rgba(127,29,29,0.12)', glowColor: 'rgba(127,29,29,0.12)' },
  { key: 'crimson-ruby', label: 'سووری ڕووبی', category: 'سووری تاریک',
    accent: '#e0245e', accentBright: '#f43f5e', accentDeep: '#9f1239', accentRgb: '224,36,94',
    bgPrimary: '#080608', bgSecondary: '#0e0810', cardBg:'#140a12', cardBorder: 'rgba(224,36,94,0.12)', glowColor: 'rgba(224,36,94,0.12)' },
  { key: 'crimson-coral', label: 'سووری کۆڕاڵ', category: 'سووری تاریک',
    accent: '#f87171', accentBright: '#fca5a5', accentDeep: '#dc2626', accentRgb: '248,113,113',
    bgPrimary: '#0a0606', bgSecondary: '#0e0808', cardBg:'#140c0c', cardBorder: 'rgba(248,113,113,0.12)', glowColor: 'rgba(248,113,113,0.12)' },

  // ── Emerald Matrices (26-31) ──
  { key: 'emerald-matrix', label: 'ماتریکس سەوز', category: 'ماتریکس سەوز',
    accent: '#00ff41', accentBright: '#4ade80', accentDeep: '#166534', accentRgb: '0,255,65',
    bgPrimary: '#050a06', bgSecondary: '#08100a', cardBg: '#0c1610', cardBorder: 'rgba(0,255,65,0.12)', glowColor: 'rgba(0,255,65,0.15)' },
  { key: 'emerald-forest', label: 'دارستانی سەوز', category: 'ماتریکس سەوز',
    accent: '#059669', accentBright: '#10b981', accentDeep: '#065f46', accentRgb: '5,150,105',
    bgPrimary: '#060a08', bgSecondary: '#0a100c', cardBg: '#0e1612', cardBorder: 'rgba(5,150,105,0.12)', glowColor: 'rgba(5,150,105,0.12)' },
  { key: 'emerald-jade', label: 'یەشمی سەوز', category: 'ماتریکس سەوز',
    accent: '#00a86b', accentBright: '#34d399', accentDeep: '#047857', accentRgb: '0,168,107',
    bgPrimary: '#060a08', bgSecondary: '#08100c', cardBg: '#0c1612', cardBorder: 'rgba(0,168,107,0.12)', glowColor: 'rgba(0,168,107,0.12)' },
  { key: 'emerald-mint', label: 'مێنتی سەوز', category: 'ماتریکس سەوز',
    accent: '#6ee7b7', accentBright: '#a7f3d0', accentDeep: '#059669', accentRgb: '110,231,183',
    bgPrimary: '#060a08', bgSecondary: '#0a100e', cardBg: '#0e1614', cardBorder: 'rgba(110,231,183,0.1)', glowColor: 'rgba(110,231,183,0.1)' },
  { key: 'emerald-teal', label: 'تیڵ سەوز', category: 'ماتریکس سەوز',
    accent: '#14b8a6', accentBright: '#2dd4bf', accentDeep: '#0f766e', accentRgb: '20,184,166',
    bgPrimary: '#060a0a', bgSecondary: '#0a1010', cardBg: '#0c1614', cardBorder: 'rgba(20,184,166,0.12)', glowColor: 'rgba(20,184,166,0.12)' },
  { key: 'emerald-pine', label: 'دارچناری سەوز', category: 'ماتریکس سەوز',
    accent: '#15803d', accentBright: '#22c55e', accentDeep: '#14532d', accentRgb: '21,128,61',
    bgPrimary: '#060a07', bgSecondary: '#0a100b', cardBg: '#0c1610', cardBorder: 'rgba(21,128,61,0.12)', glowColor: 'rgba(21,128,61,0.12)' },

  // ── Sunset Gradients (32-38) ──
  { key: 'sunset-orange', label: 'ئاوابەرانی نارەنجی', category: 'ئاوابەران',
    accent: '#f97316', accentBright: '#fb923c', accentDeep: '#c2410c', accentRgb: '249,115,22',
    bgPrimary: '#0a0605', bgSecondary: '#0f0a07', cardBg: '#15100b', cardBorder: 'rgba(249,115,22,0.12)', glowColor: 'rgba(249,115,22,0.12)' },
  { key: 'sunset-rose', label: 'ئاوابەرانی گوڵی', category: 'ئاوابەران',
    accent: '#fb7185', accentBright: '#fda4af', accentDeep: '#e11d48', accentRgb: '251,113,133',
    bgPrimary: '#0a0708', bgSecondary: '#0f0a0c', cardBg:'#15100e', cardBorder: 'rgba(251,113,133,0.12)', glowColor: 'rgba(251,113,133,0.12)' },
  { key: 'sunset-amber', label: 'ئاوابەرانی عەنەبی', category: 'ئاوابەران',
    accent: '#f59e0b', accentBright: '#fbbf24', accentDeep: '#b45309', accentRgb: '245,158,11',
    bgPrimary: '#0a0705', bgSecondary: '#0f0a07', cardBg:'#15100b', cardBorder: 'rgba(245,158,11,0.12)', glowColor: 'rgba(245,158,11,0.12)' },
  { key: 'sunset-magenta', label: 'ئاوابەرانی مەجەنتا', category: 'ئاوابەران',
    accent: '#ec4899', accentBright: '#f472b6', accentDeep: '#be185d', accentRgb: '236,72,153',
    bgPrimary: '#0a0608', bgSecondary: '#0f0810', cardBg:'#15100e', cardBorder: 'rgba(236,72,153,0.12)', glowColor: 'rgba(236,72,153,0.12)' },
  { key: 'sunset-purple', label: 'ئاوابەرانی مۆر', category: 'ئاوابەران',
    accent: '#a855f7', accentBright: '#c084fc', accentDeep: '#7e22ce', accentRgb: '168,85,247',
    bgPrimary: '#080610', bgSecondary: '#0c0a16', cardBg:'#120e1c', cardBorder: 'rgba(168,85,247,0.12)', glowColor: 'rgba(168,85,247,0.12)' },
  { key: 'sunset-coral', label: 'ئاوابەرانی کۆڕاڵ', category: 'ئاوابەران',
    accent: '#ff6b6b', accentBright: '#ff8787', accentDeep: '#e03131', accentRgb: '255,107,107',
    bgPrimary: '#0a0606', bgSecondary: '#0f0908', cardBg:'#150e0c', cardBorder: 'rgba(255,107,107,0.12)', glowColor: 'rgba(255,107,107,0.12)' },
  { key: 'sunset-peach', label: 'ئاوابەرانی هەلو', category: 'ئاوابەران',
    accent: '#ffa07a', accentBright: '#ffb088', accentDeep: '#e07856', accentRgb: '255,160,122',
    bgPrimary: '#0a0706', bgSecondary: '#0f0a08', cardBg:'#15110d', cardBorder: 'rgba(255,160,122,0.1)', glowColor: 'rgba(255,160,122,0.1)' },

  // ── Futuristic Stealth (39-45) ──
  { key: 'stealth-gray', label: 'خۆڵە نهێنی', category: 'ستێڵس',
    accent: '#64748b', accentBright: '#94a3b8', accentDeep: '#334155', accentRgb: '100,116,139',
    bgPrimary: '#08080a', bgSecondary: '#0c0d10', cardBg:'#101214', cardBorder: 'rgba(100,116,139,0.12)', glowColor: 'rgba(100,116,139,0.1)' },
  { key: 'stealth-steel', label: 'پۆڵا', category: 'ستێڵس',
    accent: '#475569', accentBright: '#64748b', accentDeep: '#1e293b', accentRgb: '71,85,105',
    bgPrimary: '#08080a', bgSecondary: '#0a0c10', cardBg:'#0e1116', cardBorder: 'rgba(71,85,105,0.12)', glowColor: 'rgba(71,85,105,0.1)' },
  { key: 'stealth-titanium', label: 'تیتانیۆم', category: 'ستێڵس',
    accent: '#94a3b8', accentBright: '#cbd5e1', accentDeep: '#475569', accentRgb: '148,163,184',
    bgPrimary: '#08080a', bgSecondary: '#0c0d12', cardBg:'#101218', cardBorder: 'rgba(148,163,184,0.12)', glowColor: 'rgba(148,163,184,0.1)' },
  { key: 'stealth-graphite', label: 'گرافیت', category: 'ستێڵس',
    accent: '#525252', accentBright: '#737373', accentDeep: '#262626', accentRgb: '82,82,82',
    bgPrimary: '#070708', bgSecondary: '#0a0a0c', cardBg:'#0e0e12', cardBorder: 'rgba(82,82,82,0.15)', glowColor: 'rgba(82,82,82,0.1)' },
  { key: 'stealth-silver', label: 'زیڤەر', category: 'ستێڵس',
    accent: '#a1a1aa', accentBright: '#d4d4d8', accentDeep: '#52525b', accentRgb: '161,161,170',
    bgPrimary: '#08080a', bgSecondary: '#0c0c10', cardBg:'#101016', cardBorder: 'rgba(161,161,170,0.12)', glowColor: 'rgba(161,161,170,0.1)' },
  { key: 'stealth-onyx', label: 'ئۆنیکس', category: 'ستێڵس',
    accent: '#27272a', accentBright: '#52525b', accentDeep: '#18181b', accentRgb: '39,39,42',
    bgPrimary: '#060608', bgSecondary: '#08080a', cardBg:'#0c0c0e', cardBorder: 'rgba(39,39,42,0.2)', glowColor: 'rgba(39,39,42,0.1)' },
  { key: 'stealth-charcoal', label: 'چارکۆڵ', category: 'ستێڵس',
    accent: '#404040', accentBright: '#737373', accentDeep: '#1a1a1a', accentRgb: '64,64,64',
    bgPrimary: '#070708', bgSecondary: '#0a0a0b', cardBg:'#0e0e10', cardBorder: 'rgba(64,64,64,0.15)', glowColor: 'rgba(64,64,64,0.1)' },

  // ── Blue Depths (46-52) ──
  { key: 'blue-ocean', label: 'ئۆقیانوسی شین', category: 'شینی قووڵ',
    accent: '#3b82f6', accentBright: '#60a5fa', accentDeep: '#1d4ed8', accentRgb: '59,130,246',
    bgPrimary: '#060810', bgSecondary: '#0a0e18', cardBg:'#0e1420', cardBorder: 'rgba(59,130,246,0.12)', glowColor: 'rgba(59,130,246,0.12)' },
  { key: 'blue-royal', label: 'شاهانەی شین', category: 'شینی قووڵ',
    accent: '#2563eb', accentBright: '#3b82f6', accentDeep: '#1e40af', accentRgb: '37,99,235',
    bgPrimary: '#060810', bgSecondary: '#080c16', cardBg:'#0c101c', cardBorder: 'rgba(37,99,235,0.12)', glowColor: 'rgba(37,99,235,0.12)' },
  { key: 'blue-navy', label: 'نەویی شین', category: 'شینی قووڵ',
    accent: '#1e40af', accentBright: '#3b82f6', accentDeep: '#172554', accentRgb: '30,64,175',
    bgPrimary: '#04060c', bgSecondary:'#080a14', cardBg:'#0c0e1a', cardBorder: 'rgba(30,64,175,0.12)', glowColor: 'rgba(30,64,175,0.12)' },
  { key: 'blue-sapphire', label: 'سافیری شین', category: 'شینی قووڵ',
    accent: '#0ea5e9', accentBright: '#38bdf8', accentDeep: '#0369a1', accentRgb: '14,165,233',
    bgPrimary: '#060810', bgSecondary:'#0a0e16', cardBg:'#0e141e', cardBorder: 'rgba(14,165,233,0.12)', glowColor: 'rgba(14,165,233,0.12)' },
  { key: 'blue-azure', label: 'ئاسمانی شین', category: 'شینی قووڵ',
    accent: '#0284c7', accentBright: '#0ea5e9', accentDeep: '#075985', accentRgb: '2,132,199',
    bgPrimary: '#060810', bgSecondary:'#080c14', cardBg:'#0c1018', cardBorder: 'rgba(2,132,199,0.12)', glowColor: 'rgba(2,132,199,0.12)' },
  { key: 'blue-indigo', label: 'ئیندیگۆ', category: 'شینی قووڵ',
    accent: '#4f46e5', accentBright: '#818cf8', accentDeep: '#3730a3', accentRgb: '79,70,229',
    bgPrimary: '#080610', bgSecondary:'#0c0a18', cardBg:'#120e20', cardBorder: 'rgba(79,70,229,0.12)', glowColor: 'rgba(79,70,229,0.12)' },
  { key: 'blue-sky', label: 'ئاسمانی', category: 'شینی قووڵ',
    accent: '#38bdf8', accentBright: '#7dd3fc', accentDeep: '#0284c7', accentRgb: '56,189,248',
    bgPrimary: '#060810', bgSecondary:'#0a0e16', cardBg:'#0e141e', cardBorder: 'rgba(56,189,248,0.12)', glowColor: 'rgba(56,189,248,0.1)' },

  // ── Special / Premium (53-57) ──
  { key: 'aurora-green', label: 'ئاورۆرا سەوز', category: 'تایبەت',
    accent: '#22d3ee', accentBright: '#67e8f9', accentDeep: '#0891b2', accentRgb: '34,211,238',
    bgPrimary: '#050810', bgSecondary:'#081018', cardBg:'#0c1620', cardBorder: 'rgba(34,211,238,0.12)', glowColor: 'rgba(34,211,238,0.15)' },
  { key: 'midnight-blue', label: 'نیوەشەوی شین', category: 'تایبەت',
    accent: '#1e3a8a', accentBright: '#3b82f6', accentDeep: '#172554', accentRgb: '30,58,138',
    bgPrimary: '#04060c', bgSecondary:'#060810', cardBg:'#0a0e18', cardBorder: 'rgba(30,58,138,0.15)', glowColor: 'rgba(30,58,138,0.12)' },
  { key: 'deep-space', label: 'بۆشایی قووڵ', category: 'تایبەت',
    accent: '#7c3aed', accentBright: '#a78bfa', accentDeep: '#5b21b6', accentRgb: '124,58,237',
    bgPrimary: '#060410', bgSecondary:'#0a0816', cardBg:'#0e0c1e', cardBorder: 'rgba(124,58,237,0.12)', glowColor: 'rgba(124,58,237,0.12)' },
  { key: 'neon-blue', label: 'نیۆن شین', category: 'تایبەت',
    accent: '#3b82f6', accentBright: '#60a5fa', accentDeep: '#1e40af', accentRgb: '59,130,246',
    bgPrimary: '#040810', bgSecondary:'#080c18', cardBg:'#0c101c', cardBorder: 'rgba(59,130,246,0.15)', glowColor: 'rgba(59,130,246,0.18)' },
  { key: 'oled-pure', label: 'OLED پەتی', category: 'تایبەت',
    accent: '#eab308', accentBright: '#fbbf24', accentDeep: '#a16207', accentRgb: '234,179,8',
    bgPrimary: '#000000', bgSecondary:'#050505', cardBg:'#0a0a0a', cardBorder: 'rgba(234,179,8,0.08)', glowColor: 'rgba(234,179,8,0.06)' },
];

export const PALETTE_MAP: Record<string, ColorPalette> = Object.fromEntries(
  PALETTES.map(p => [p.key, p])
);

export const CATEGORIES: string[] = Array.from(new Set(PALETTES.map(p => p.category)));

// ── Backward compatibility: legacy AccentKey system ──
export type AccentKey = 'gold' | 'cyan' | 'emerald' | 'crimson' | 'purple';

export interface AccentTheme {
  key: AccentKey;
  label: string;
  base: string;
  bright: string;
  deep: string;
  rgb: string;
}

export const ACCENT_THEMES: Record<AccentKey, AccentTheme> = {
  gold: { key: 'gold', label: 'زێڕ', base: '#eab308', bright: '#fbbf24', deep: '#a16207', rgb: '234,179,8' },
  cyan: { key: 'cyan', label: 'شین', base: '#06b6d4', bright: '#22d3ee', deep: '#0e7490', rgb: '6,182,212' },
  emerald: { key: 'emerald', label: 'سەوز', base: '#10b981', bright: '#34d399', deep: '#047857', rgb: '16,185,129' },
  crimson: { key: 'crimson', label: 'سوور', base: '#ef4444', bright: '#f87171', deep: '#b91c1c', rgb: '239,68,68' },
  purple: { key: 'purple', label: 'مۆر', base: '#8b5cf6', bright: '#a78bfa', deep: '#6d28d9', rgb: '139,92,246' },
};

// ── Cinematic themes (legacy compat) ──
export type CinematicKey =
  | 'dark-gold' | 'cyberpunk' | 'oled-black'
  | 'got' | 'breaking-bad' | 'stranger-things' | 'harry-potter';

export interface CinematicTheme {
  key: CinematicKey;
  label: string;
  description: string;
  accent: AccentKey;
  bgGradient: string;
  particleType: 'snow' | 'smoke' | 'sparks' | 'glitch' | 'goldDust' | 'none';
  particleColor: string;
  glowColor: string;
}

export const CINEMATIC_THEMES: Record<CinematicKey, CinematicTheme> = {
  'dark-gold': {
    key: 'dark-gold', label: 'تاریکی زێڕین', description: 'ڕەنگی زێڕین لەسەر پاشخانێکی تاریک',
    accent: 'gold',
    bgGradient: 'linear-gradient(135deg, #0a0a0a 0%, #14110a 50%, #0a0a0a 100%)',
    particleType: 'none', particleColor: '', glowColor: 'rgba(234,179,8,0.12)',
  },
  cyberpunk: {
    key: 'cyberpunk', label: 'سایبەرپەنک', description: 'نیۆن شین و مۆر',
    accent: 'cyan',
    bgGradient: 'linear-gradient(135deg, #0a0a14 0%, #0d0d22 50%, #100a1a 100%)',
    particleType: 'glitch', particleColor: '#22d3ee', glowColor: 'rgba(6,182,212,0.15)',
  },
  'oled-black': {
    key: 'oled-black', label: 'OLED ڕەش', description: 'ڕەشی پەتی بۆ OLED',
    accent: 'gold',
    bgGradient: '#000000',
    particleType: 'none', particleColor: '', glowColor: 'rgba(234,179,8,0.08)',
  },
  got: {
    key: 'got', label: 'Game of Thrones', description: 'بەفنی کەوتوو و پاشخانێکی سەهۆڵین',
    accent: 'cyan',
    bgGradient: 'linear-gradient(180deg, #0a0e14 0%, #0d1419 50%, #080a0e 100%)',
    particleType: 'snow', particleColor: '#e0eef5', glowColor: 'rgba(120,180,220,0.12)',
  },
  'breaking-bad': {
    key: 'breaking-bad', label: 'Breaking Bad', description: 'دووکەڵی سەوز و کیمیاوی',
    accent: 'emerald',
    bgGradient: 'linear-gradient(135deg, #0a0e0a 0%, #0d130d 50%, #0a0a0a 100%)',
    particleType: 'smoke', particleColor: '#34d399', glowColor: 'rgba(16,185,129,0.12)',
  },
  'stranger-things': {
    key: 'stranger-things', label: 'Stranger Things', description: 'سینت-سوور و تاریک',
    accent: 'crimson',
    bgGradient: 'linear-gradient(180deg, #0a0008 0%, #14000a 50%, #0a0006 100%)',
    particleType: 'sparks', particleColor: '#ef4444', glowColor: 'rgba(239,68,68,0.15)',
  },
  'harry-potter': {
    key: 'harry-potter', label: 'Harry Potter', description: 'گەردوونی جادووگەری و تۆزی زێڕین',
    accent: 'gold',
    bgGradient: 'linear-gradient(135deg, #0a0805 0%, #120d08 50%, #1a0e08 100%)',
    particleType: 'goldDust', particleColor: '#fbbf24', glowColor: 'rgba(251,191,36,0.15)',
  },
};

// ── Storage keys ──
const STORAGE_KEY = 'ks_accent_theme';
const PALETTE_KEY = 'ks_color_palette';
const CINEMA_KEY = 'ks_cinematic_theme';

// ── Palette API ──

export function getStoredPalette(): string {
  try {
    const stored = localStorage.getItem(PALETTE_KEY);
    if (stored && PALETTE_MAP[stored]) return stored;
  } catch { /* localStorage unavailable */ }
  return 'obsidian-gold';
}

export function applyPalette(key: string): void {
  const p = PALETTE_MAP[key];
  if (!p) return;
  const root = document.documentElement;
  root.style.setProperty('--accent-base', p.accent);
  root.style.setProperty('--accent-bright', p.accentBright);
  root.style.setProperty('--accent-deep', p.accentDeep);
  root.style.setProperty('--accent-rgb', p.accentRgb);
  root.style.setProperty('--bg-primary', p.bgPrimary);
  root.style.setProperty('--bg-secondary', p.bgSecondary);
  root.style.setProperty('--card-bg', p.cardBg);
  root.style.setProperty('--card-border', p.cardBorder);
  root.style.setProperty('--cinema-glow', p.glowColor);
  root.style.setProperty('--cinema-bg', `linear-gradient(135deg, ${p.bgPrimary} 0%, ${p.bgSecondary} 50%, ${p.cardBg} 100%)`);
  try { localStorage.setItem(PALETTE_KEY, key); } catch { /* ignore */ }
}

export function setPalette(key: string): void {
  applyPalette(key);
  // Also sync legacy accent key for components that listen
  const p = PALETTE_MAP[key];
  if (p) {
    const legacyKey = matchLegacyAccent(p.accent);
    try { localStorage.setItem(STORAGE_KEY, legacyKey); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('accent-change', { detail: legacyKey }));
  }
  window.dispatchEvent(new CustomEvent('palette-change', { detail: key }));
}

function matchLegacyAccent(hex: string): AccentKey {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (g > 180 && r < 100) return 'emerald';
  if (b > 180 && r < 100) return 'cyan';
  if (r > 200 && g < 100) return 'crimson';
  if (r > 100 && b > 100) return 'purple';
  return 'gold';
}

// ── Legacy compat API (still used by existing components) ──

export function getStoredAccent(): AccentKey {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as AccentKey | null;
    if (stored && ACCENT_THEMES[stored]) return stored;
  } catch { /* localStorage unavailable */ }
  const palette = getStoredPalette();
  return matchLegacyAccent(PALETTE_MAP[palette]?.accent || '#eab308');
}

export function getStoredCinematic(): CinematicKey | null {
  try {
    return (localStorage.getItem(CINEMA_KEY) as CinematicKey | null) || null;
  } catch { return null; }
}

export function applyAccent(key: AccentKey): void {
  const theme = ACCENT_THEMES[key];
  if (!theme) return;
  const root = document.documentElement;
  root.style.setProperty('--accent-base', theme.base);
  root.style.setProperty('--accent-bright', theme.bright);
  root.style.setProperty('--accent-deep', theme.deep);
  root.style.setProperty('--accent-rgb', theme.rgb);
  try { localStorage.setItem(STORAGE_KEY, key); } catch { /* ignore */ }
}

export function applyCinematic(key: CinematicKey | null): void {
  const root = document.documentElement;
  if (!key) {
    root.style.setProperty('--cinema-bg', 'linear-gradient(135deg, #08080a 0%, #0d0e12 50%, #12131a 100%)');
    root.style.setProperty('--cinema-particle', 'none');
    root.style.setProperty('--cinema-glow', 'rgba(var(--accent-rgb), 0.08)');
    try { localStorage.removeItem(CINEMA_KEY); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('cinema-change', { detail: null }));
    return;
  }
  const theme = CINEMATIC_THEMES[key];
  if (!theme) return;
  root.style.setProperty('--cinema-bg', theme.bgGradient);
  root.style.setProperty('--cinema-particle', theme.particleType);
  root.style.setProperty('--cinema-glow', theme.glowColor);
  applyAccent(theme.accent);
  try { localStorage.setItem(CINEMA_KEY, key); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('cinema-change', { detail: key }));
}

export function setAccent(key: AccentKey): void {
  applyAccent(key);
  window.dispatchEvent(new CustomEvent('accent-change', { detail: key }));
}

export function setCinematic(key: CinematicKey | null): void {
  applyCinematic(key);
  const cine = key ? CINEMATIC_THEMES[key] : null;
  window.dispatchEvent(new CustomEvent('accent-change', { detail: cine ? cine.accent : getStoredAccent() }));
}
