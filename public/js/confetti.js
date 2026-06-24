/**
 * Lightweight one-shot confetti burst (no dependencies).
 */
(function () {
  window.HRMS = window.HRMS || {};

  const COLORS = [
    '#ed1d24',
    '#ff6b35',
    '#f7c948',
    '#22c55e',
    '#3b82f6',
    '#a855f7',
    '#ec4899',
    '#06b6d4',
    '#ffffff',
    '#fbbf24',
  ];

  HRMS.fireConfettiBurst = function fireConfettiBurst(origin) {
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.remove();
      return;
    }

    const ox = origin?.x ?? window.innerWidth * 0.5;
    const oy = origin?.y ?? window.innerHeight * 0.42;
    const count = 280;
    const particles = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 10 + Math.random() * 22;
      return {
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 8,
        w: 14 + Math.random() * 18,
        h: 8 + Math.random() * 16,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.55,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 1,
        decay: 0.006 + Math.random() * 0.007,
      };
    });

    let frame = 0;
    const maxFrames = 200;

    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = 0;
      for (const p of particles) {
        if (p.life <= 0) continue;
        alive += 1;
        p.vy += 0.22;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= p.decay;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      frame += 1;
      if (alive > 0 && frame < maxFrames) {
        requestAnimationFrame(tick);
      } else {
        canvas.remove();
      }
    }

    requestAnimationFrame(tick);
  };
})();
