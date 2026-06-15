import confetti from 'canvas-confetti';

export function runConfettiBurst() {
  const duration = 3200;
  const end = Date.now() + duration;
  const colors = ['#ed1d24', '#697279', '#ebebec', '#ffffff', '#22c55e'];

  const frame = () => {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 65,
      origin: { x: 0, y: 0.6 },
      colors,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 65,
      origin: { x: 1, y: 0.6 },
      colors,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
  confetti({ particleCount: 140, spread: 95, origin: { y: 0.5 }, colors });
}
