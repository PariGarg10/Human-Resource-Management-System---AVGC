import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export type GameFinish = (score: number) => void;

const HANGMAN_WORDS = ['REACT', 'NODE', 'PIXEL', 'QUEST', 'ARENA', 'BONUS', 'CROWN', 'DANCE', 'EPOCH', 'FOCUS'];

function randWord() {
  return HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
}

function GameHud({ title, score, hint, children }: { title: string; score: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-4 shadow-lg">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-black text-violet-900">{title}</h3>
        <span className="rounded-full bg-violet-600 px-3 py-1 text-sm font-bold text-white">{score}</span>
      </div>
      {hint && <p className="mb-3 text-xs font-medium text-violet-600">{hint}</p>}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minesweeper
// ---------------------------------------------------------------------------

export function MinesweeperGame({ onFinish }: { onFinish: GameFinish }) {
  const W = 8;
  const H = 8;
  const MINES = 10;

  const [grid, setGrid] = useState<boolean[]>(() => Array(W * H).fill(false));
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const [flags, setFlags] = useState<Set<number>>(() => new Set());
  const [won, setWon] = useState(false);
  const [lost, setLost] = useState(false);
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // useRef so win/loss handlers always read the real start time, not a stale closure
  const startTimeRef = useRef<number>(0);
  // Prevent onFinish from firing more than once per game
  const finishedRef = useRef(false);
  // Stable ref to onFinish so it never re-triggers effects
  const onFinishRef = useRef(onFinish);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

  const buildGrid = (safe: number): boolean[] => {
    const g = Array(W * H).fill(false) as boolean[];
    let placed = 0;
    while (placed < MINES) {
      const i = Math.floor(Math.random() * W * H);
      if (i !== safe && !g[i]) { g[i] = true; placed++; }
    }
    return g;
  };

  const countNeighbors = (idx: number, g: boolean[]): number => {
    const x = idx % W;
    const y = Math.floor(idx / W);
    let n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx; const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && g[ny * W + nx]) n++;
      }
    return n;
  };

  // Iterative flood-fill instead of recursive — avoids stack overflows on large boards
  const floodReveal = (start: number, g: boolean[], current: Set<number>): Set<number> => {
    const next = new Set(current);
    const queue = [start];
    while (queue.length > 0) {
      const idx = queue.pop()!;
      if (next.has(idx) || g[idx]) continue;
      next.add(idx);
      if (countNeighbors(idx, g) === 0) {
        const x = idx % W; const y = Math.floor(idx / W);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx; const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < W && ny < H) queue.push(ny * W + nx);
          }
      }
    }
    return next;
  };

  // Timer
  useEffect(() => {
    if (!started || won || lost) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [started, won, lost]);

  const click = (idx: number) => {
    if (won || lost || flags.has(idx) || revealed.has(idx)) return;

    let g = grid;
    if (!started) {
      g = buildGrid(idx);
      setGrid(g);
      setStarted(true);
      startTimeRef.current = Date.now();
    }

    if (g[idx]) {
      setLost(true);
      if (!finishedRef.current) {
        finishedRef.current = true;
        onFinishRef.current(0); // 0 = loss; parent can treat 0 as a special case
      }
      return;
    }

    const rev = floodReveal(idx, g, revealed);
    setRevealed(rev);

    const safeCells = W * H - MINES;
    if (rev.size >= safeCells) {
      setWon(true);
      const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      if (!finishedRef.current) {
        finishedRef.current = true;
        onFinishRef.current(Math.max(1, sec));
      }
    }
  };

  const toggleFlag = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation(); // prevent click from also firing
    if (won || lost || revealed.has(idx)) return;
    setFlags((f) => { const n = new Set(f); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  };

  return (
    <GameHud title="🧩 Minesweeper" score={`${elapsed}s`} hint="Click to reveal · Right-click to flag">
      <div className="mx-auto grid max-w-xs grid-cols-8 gap-1">
        {Array.from({ length: W * H }, (_, i) => {
          const open = revealed.has(i);
          const flagged = flags.has(i);
          const isMine = open && grid[i];
          const val = open && !grid[i] ? countNeighbors(i, grid) : 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => click(i)}
              onContextMenu={(e) => toggleFlag(e, i)}
              disabled={won || lost}
              className={`aspect-square rounded text-xs font-bold transition-colors
                ${open
                  ? isMine ? 'bg-red-500' : 'bg-stone-200'
                  : flagged ? 'bg-emerald-600 ring-2 ring-yellow-400' : 'bg-emerald-500 hover:bg-emerald-400'}
              `}
            >
              {open ? (grid[i] ? '💥' : val || '') : flagged ? '🚩' : ''}
            </button>
          );
        })}
      </div>
      {won && <p className="mt-2 text-center font-bold text-green-600">Cleared in {elapsed}s!</p>}
      {lost && <p className="mt-2 text-center font-bold text-red-600">Boom! Better luck next time.</p>}
    </GameHud>
  );
}

// ---------------------------------------------------------------------------
// Hangman
// ---------------------------------------------------------------------------

export function HangmanGame({ onFinish }: { onFinish: GameFinish }) {
  const [word, setWord] = useState(randWord);
  const [guessed, setGuessed] = useState<Set<string>>(() => new Set());
  const [wrong, setWrong] = useState(0);

  // Use a ref for the cleared count so the win effect always reads the latest value
  const clearedRef = useRef(0);
  const [clearedDisplay, setClearedDisplay] = useState(0);

  const onFinishRef = useRef(onFinish);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

  const won = word.split('').every((c) => guessed.has(c));
  const lost = wrong >= 6;

  const resetRound = useCallback(() => {
    setWord(randWord());
    setGuessed(new Set());
    setWrong(0);
  }, []);

  useEffect(() => {
    if (!won && !lost) return;
    if (won) {
      clearedRef.current += 1;
      setClearedDisplay(clearedRef.current);
      onFinishRef.current(clearedRef.current);
    }
    const id = setTimeout(resetRound, 1200);
    return () => clearTimeout(id); // cleanup if component unmounts or effect re-fires
  }, [won, lost, resetRound]);

  const guess = (ch: string) => {
    if (guessed.has(ch) || won || lost) return;
    setGuessed((g) => new Set(g).add(ch));
    if (!word.includes(ch)) setWrong((w) => w + 1);
  };

  const STAGES = ['😊', '😐', '😬', '😰', '😵', '💀', '☠️'];

  return (
    <GameHud title="🔤 Hangman" score={`Cleared ${clearedDisplay}`} hint="Guess the word letter by letter">
      <p className="mb-2 text-center text-4xl">{STAGES[wrong]}</p>
      <p className="mb-3 text-center font-mono text-2xl font-black tracking-widest">
        {word.split('').map((c, i) => (
          <span key={i}>{guessed.has(c) ? c : '_'} </span>
        ))}
      </p>
      <div className="flex flex-wrap justify-center gap-1">
        {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((k) => (
          <button
            key={k}
            type="button"
            disabled={guessed.has(k)}
            onClick={() => guess(k)}
            className={`rounded px-2 py-1 text-xs font-bold transition-colors
              ${guessed.has(k)
                ? word.includes(k) ? 'bg-green-200 text-green-800' : 'bg-stone-100 text-stone-400'
                : 'bg-stone-200 hover:bg-stone-300'
              }`}
          >
            {k}
          </button>
        ))}
      </div>
      {lost && <p className="mt-2 text-center font-bold text-red-600">Word was {word}</p>}
    </GameHud>
  );
}

// ---------------------------------------------------------------------------
// Whack-a-Mole
// ---------------------------------------------------------------------------

export function WhackGame({ onFinish }: { onFinish: GameFinish }) {
  const [active, setActive] = useState<number | null>(null);
  const [hits, setHits] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [running, setRunning] = useState(true);

  // Refs so timer callback always reads the latest hit count without being in deps
  const hitsRef = useRef(0);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

  // Sync hitsRef whenever hits state changes
  useEffect(() => { hitsRef.current = hits; }, [hits]);

  // Mole movement
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setActive(Math.floor(Math.random() * 9)), 700);
    return () => clearInterval(id);
  }, [running]);

  // Countdown timer
  useEffect(() => {
    if (!running) return;
    if (timeLeft <= 0) {
      setRunning(false);
      setActive(null);
      if (!finishedRef.current) {
        finishedRef.current = true;
        onFinishRef.current(hitsRef.current);
      }
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft, running]);

  const whack = (i: number) => {
    if (!running || i !== active) return;
    setHits((h) => h + 1);
    setActive(null);
  };

  return (
    <GameHud title="🔨 Whack-a-Mole" score={`${hits} hits · ${timeLeft}s`} hint="Click the mole!">
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
        {Array.from({ length: 9 }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => whack(i)}
            disabled={!running}
            className={`flex aspect-square items-center justify-center rounded-2xl text-4xl transition-all
              ${active === i ? 'scale-110 bg-amber-300 shadow-lg' : 'bg-green-700'}`}
          >
            {active === i ? '🐹' : '🕳️'}
          </button>
        ))}
      </div>
      {!running && timeLeft <= 0 && (
        <p className="mt-2 text-center font-bold text-violet-700">Final score: {hits} hits!</p>
      )}
    </GameHud>
  );
}

export const GAME_COMPONENTS: Record<string, (props: { onFinish: GameFinish }) => ReactNode> = {
  minesweeper: MinesweeperGame,
  hangman: HangmanGame,
  whack: WhackGame,
};