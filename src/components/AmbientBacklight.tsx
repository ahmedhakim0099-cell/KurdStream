import { useEffect, useState, useRef } from 'react';
import { corsFetch } from '@/lib/corsFetch';

interface AmbientBacklightProps {
  posterPath: string | null | undefined;
  intensity?: number;
}

const COLOR_CACHE = new Map<string, string>();

async function extractDominantColor(imgUrl: string): Promise<string> {
  if (COLOR_CACHE.has(imgUrl)) return COLOR_CACHE.get(imgUrl)!;
  try {
    const res = await corsFetch(imgUrl);
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    const w = 32, h = 48;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '#f59e0b';
    ctx.drawImage(bmp, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (brightness > 30 && brightness < 230) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }
    }
    if (count === 0) return '#f59e0b';
    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);
    const hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
    COLOR_CACHE.set(imgUrl, hex);
    return hex;
  } catch {
    return '#f59e0b';
  }
}

export default function AmbientBacklight({ posterPath, intensity = 0.4 }: AmbientBacklightProps) {
  const [color, setColor] = useState<string>('#f59e0b');
  const lastPath = useRef<string>('');

  useEffect(() => {
    if (!posterPath) return;
    const fullUrl = `https://image.tmdb.org/t/p/w92${posterPath}`;
    if (lastPath.current === fullUrl) return;
    lastPath.current = fullUrl;
    extractDominantColor(fullUrl).then(setColor);
  }, [posterPath]);

  return (
    <div
      className="absolute inset-0 pointer-events-none transition-all duration-1000"
      style={{
        background: `radial-gradient(ellipse at center, ${color}${Math.round(intensity * 255).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
        filter: 'blur(60px)',
        transform: 'scale(1.5)',
        zIndex: 0,
      }}
      aria-hidden
    />
  );
}
