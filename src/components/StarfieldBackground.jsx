import { useEffect, useRef } from 'react';

// Density of stars per square pixel. ~0.0001 = nice without melting older laptops.
const STAR_DENSITY = 0.00012;
// How fast stars drift upward (px per frame, scaled by depth).
const DRIFT_SPEED = 0.04;

/**
 * Full-viewport animated starfield rendered to a <canvas>. Theme-aware: reads
 * `data-theme` from <html> and updates palette accordingly.
 *
 * Optional prop `videoSrc` — if you'd rather use a real .mp4 file, pass its
 * URL here and the canvas is replaced by a looping muted <video>.
 */
export default function StarfieldBackground({ videoSrc }) {
  const canvasRef = useRef(null);

  if (videoSrc) {
    return (
      <video
        className="starfield-bg"
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
      >
        <source src={videoSrc} type="video/mp4" />
      </video>
    );
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let stars = [];
    let shootingStars = [];
    let animationId;
    let running = true;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.floor(w * h * STAR_DENSITY);
      stars = Array.from({ length: count }, () => makeStar(w, h));
    }

    function makeStar(w, h) {
      // Depth in [0.3, 1.0] — nearer stars are larger and brighter and drift faster.
      const z = Math.random() * 0.7 + 0.3;
      // 18% chance of a tinted (blueish/cyan) star. 5% pinkish. Rest white.
      let hue = null;
      const r = Math.random();
      if (r < 0.18) hue = 200 + Math.random() * 40;
      else if (r < 0.23) hue = 320 + Math.random() * 30;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        z,
        baseSize: (Math.random() * 1.2 + 0.4) * z,
        twinkleSpeed: Math.random() * 0.0024 + 0.0006,
        twinkleOffset: Math.random() * Math.PI * 2,
        hue
      };
    }

    function maybeSpawnShootingStar(w, h) {
      // ~ once every 8 seconds
      if (Math.random() < 0.0025 && shootingStars.length < 2) {
        shootingStars.push({
          x: Math.random() * w,
          y: Math.random() * h * 0.5,
          vx: 4 + Math.random() * 3,
          vy: 1 + Math.random() * 1.5,
          life: 0,
          maxLife: 60 + Math.random() * 30
        });
      }
    }

    function draw(now) {
      if (!running) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isDark = document.documentElement.dataset.theme === 'dark';

      // Background gradient.
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      if (isDark) {
        grad.addColorStop(0, '#03060f');
        grad.addColorStop(0.5, '#070b1c');
        grad.addColorStop(1, '#0a0815');
      } else {
        grad.addColorStop(0, '#1a1240');
        grad.addColorStop(0.45, '#4a1f7a');
        grad.addColorStop(0.85, '#2349a8');
        grad.addColorStop(1, '#1a3380');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Soft nebula glow (radial blob, low opacity).
      const blob = ctx.createRadialGradient(
        w * 0.78,
        h * 0.22,
        0,
        w * 0.78,
        h * 0.22,
        Math.max(w, h) * 0.55
      );
      if (isDark) {
        blob.addColorStop(0, 'rgba(99, 102, 241, 0.18)');
        blob.addColorStop(1, 'rgba(99, 102, 241, 0)');
      } else {
        blob.addColorStop(0, 'rgba(244, 114, 182, 0.22)');
        blob.addColorStop(1, 'rgba(244, 114, 182, 0)');
      }
      ctx.fillStyle = blob;
      ctx.fillRect(0, 0, w, h);

      // Second nebula blob.
      const blob2 = ctx.createRadialGradient(
        w * 0.18,
        h * 0.78,
        0,
        w * 0.18,
        h * 0.78,
        Math.max(w, h) * 0.45
      );
      if (isDark) {
        blob2.addColorStop(0, 'rgba(168, 85, 247, 0.15)');
        blob2.addColorStop(1, 'rgba(168, 85, 247, 0)');
      } else {
        blob2.addColorStop(0, 'rgba(56, 189, 248, 0.2)');
        blob2.addColorStop(1, 'rgba(56, 189, 248, 0)');
      }
      ctx.fillStyle = blob2;
      ctx.fillRect(0, 0, w, h);

      // Stars
      for (const star of stars) {
        const phase = reduced
          ? 0
          : Math.sin(now * star.twinkleSpeed + star.twinkleOffset);
        const opacity = (0.45 + (phase + 1) / 2 * 0.55) * star.z;
        const size = star.baseSize * (0.85 + phase * 0.15);

        ctx.beginPath();
        ctx.arc(star.x, star.y, size, 0, Math.PI * 2);
        if (star.hue !== null) {
          ctx.fillStyle = `hsla(${star.hue}, 80%, 82%, ${opacity})`;
        } else {
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        }
        ctx.fill();

        // Halo for the brightest stars.
        if (star.z > 0.85 && size > 1.4) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, size * 2.4, 0, Math.PI * 2);
          ctx.fillStyle = star.hue !== null
            ? `hsla(${star.hue}, 80%, 82%, ${opacity * 0.18})`
            : `rgba(255, 255, 255, ${opacity * 0.18})`;
          ctx.fill();
        }

        // Drift upward.
        if (!reduced) {
          star.y -= DRIFT_SPEED * star.z;
          if (star.y < -2) {
            star.y = h + 2;
            star.x = Math.random() * w;
          }
        }
      }

      // Shooting stars (skip if reduced motion)
      if (!reduced) {
        maybeSpawnShootingStar(w, h);
        shootingStars = shootingStars.filter((s) => s.life < s.maxLife);
        for (const s of shootingStars) {
          s.life += 1;
          s.x += s.vx;
          s.y += s.vy;
          const t = s.life / s.maxLife;
          const fade = Math.sin(t * Math.PI);

          ctx.strokeStyle = `rgba(255, 255, 255, ${fade * 0.85})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - s.vx * 8, s.y - s.vy * 8);
          ctx.stroke();
        }
      }

      animationId = requestAnimationFrame(draw);
    }

    function handleVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(animationId);
      } else if (!running) {
        running = true;
        animationId = requestAnimationFrame(draw);
      }
    }

    resize();
    animationId = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="starfield-bg" aria-hidden="true" />;
}
