import { useEffect, useRef } from 'react';
import type { CinematicKey } from '@/accentTheme';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  angle: number;
  angleSpeed: number;
}

export default function CinematicParticles({ theme }: { theme: CinematicKey | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!theme) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const getThemeConfig = (key: CinematicKey) => {
      const configs: Record<CinematicKey, { color: string; type: string; count: number }> = {
        'dark-gold': { color: '#eab308', type: 'none', count: 0 },
        'cyberpunk': { color: '#22d3ee', type: 'glitch', count: 30 },
        'oled-black': { color: '#eab308', type: 'none', count: 0 },
        'got': { color: '#e0eef5', type: 'snow', count: 60 },
        'breaking-bad': { color: '#34d399', type: 'smoke', count: 20 },
        'stranger-things': { color: '#ef4444', type: 'sparks', count: 25 },
        'harry-potter': { color: '#fbbf24', type: 'goldDust', count: 50 },
      };
      return configs[key];
    };

    const config = getThemeConfig(theme);
    if (config.count === 0) return;

    let particles: Particle[] = [];
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);

    const createParticle = (type: string): Particle => {
      if (type === 'snow') {
        return {
          x: Math.random() * w, y: -10,
          vx: (Math.random() - 0.5) * 0.5, vy: Math.random() * 1.2 + 0.4,
          size: Math.random() * 2.5 + 0.8, life: 0, maxLife: h + 20,
          angle: 0, angleSpeed: 0,
        };
      } else if (type === 'smoke') {
        return {
          x: Math.random() * w, y: h + 10,
          vx: (Math.random() - 0.5) * 0.3, vy: -(Math.random() * 0.6 + 0.2),
          size: Math.random() * 15 + 8, life: 0, maxLife: h + 20,
          angle: 0, angleSpeed: 0,
        };
      } else if (type === 'sparks') {
        return {
          x: Math.random() * w, y: h + 5,
          vx: (Math.random() - 0.5) * 0.8, vy: -(Math.random() * 1.5 + 0.8),
          size: Math.random() * 1.5 + 0.4, life: 0, maxLife: 180,
          angle: 0, angleSpeed: 0,
        };
      } else if (type === 'goldDust') {
        return {
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3, vy: -(Math.random() * 0.4 + 0.1),
          size: Math.random() * 2 + 0.5, life: 0, maxLife: 300 + Math.random() * 200,
          angle: Math.random() * Math.PI * 2, angleSpeed: (Math.random() - 0.5) * 0.02,
        };
      } else {
        return {
          x: Math.random() * w, y: Math.random() * h,
          vx: 0, vy: 0,
          size: Math.random() * 2 + 1, life: 0, maxLife: 50,
          angle: 0, angleSpeed: 0,
        };
      }
    };

    for (let i = 0; i < config.count; i++) {
      const p = createParticle(config.type);
      p.y = Math.random() * h;
      particles.push(p);
    }

    let lastTime = 0;
    const draw = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;
      ctx.clearRect(0, 0, w, h);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        if (config.type === 'snow') {
          p.x += Math.sin(p.life * 0.01) * 0.3;
          ctx.fillStyle = config.color;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          if (p.y > h + 10) particles[i] = createParticle(config.type);
        } else if (config.type === 'smoke') {
          ctx.fillStyle = config.color;
          ctx.globalAlpha = Math.max(0, 0.06 * (1 - p.life / p.maxLife));
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          if (p.y < -30) particles[i] = createParticle(config.type);
        } else if (config.type === 'sparks') {
          ctx.fillStyle = config.color;
          ctx.globalAlpha = Math.max(0, 0.8 - p.life / p.maxLife);
          ctx.fillRect(p.x, p.y, p.size, p.size);
          if (p.life > p.maxLife || p.y < -10) particles[i] = createParticle(config.type);
        } else if (config.type === 'goldDust') {
          p.angle += p.angleSpeed;
          p.x += Math.sin(p.angle) * 0.5;
          const lifeRatio = p.life / p.maxLife;
          const alpha = Math.sin(lifeRatio * Math.PI) * 0.6;
          ctx.fillStyle = config.color;
          ctx.globalAlpha = Math.max(0, alpha);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          // glow
          ctx.globalAlpha = Math.max(0, alpha * 0.3);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
          ctx.fill();
          if (p.life > p.maxLife) particles[i] = createParticle(config.type);
        } else if (config.type === 'glitch') {
          ctx.fillStyle = config.color;
          ctx.globalAlpha = Math.random() * 0.3;
          ctx.fillRect(p.x, p.y, Math.random() * 20 + 5, p.size);
          if (p.life > p.maxLife) particles[i] = createParticle(config.type);
        }
      }
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      ctx.clearRect(0, 0, w, h);
    };
  }, [theme]);

  if (!theme) return null;
  const themesWithParticles: CinematicKey[] = ['cyberpunk', 'got', 'breaking-bad', 'stranger-things', 'harry-potter'];
  if (!themesWithParticles.includes(theme)) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity: 0.7 }}
    />
  );
}
