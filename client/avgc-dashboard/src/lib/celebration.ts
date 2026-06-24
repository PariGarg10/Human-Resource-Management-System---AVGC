import confetti from 'canvas-confetti';

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

export function runConfettiBurst() {
  const duration = 4200;
  const end = Date.now() + duration;

  const frame = () => {
    confetti({
      particleCount: 12,
      angle: 60,
      spread: 85,
      startVelocity: 55,
      origin: { x: 0, y: 0.55 },
      colors: COLORS,
      scalar: 1.35,
    });
    confetti({
      particleCount: 12,
      angle: 120,
      spread: 85,
      startVelocity: 55,
      origin: { x: 1, y: 0.55 },
      colors: COLORS,
      scalar: 1.35,
    });
    confetti({
      particleCount: 8,
      spread: 100,
      startVelocity: 45,
      origin: { x: 0.5, y: 0.35 },
      colors: COLORS,
      scalar: 1.4,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
  confetti({
    particleCount: 220,
    spread: 120,
    startVelocity: 48,
    origin: { y: 0.5, x: 0.5 },
    colors: COLORS,
    scalar: 1.45,
  });
}

/** Single gentle burst for onboarding unlock — not a full-screen shower. */
export function runConfettiBurstLight() {
  confetti({
    particleCount: 36,
    spread: 62,
    startVelocity: 28,
    origin: { y: 0.62, x: 0.5 },
    colors: COLORS,
    scalar: 0.95,
    ticks: 120,
    gravity: 0.9,
  });
}
