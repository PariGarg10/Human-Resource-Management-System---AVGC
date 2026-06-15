export type ScoreMode = 'higher' | 'lower';

export type GameDef = {
  id: string;
  emoji: string;
  title: string;
  tagline: string;
  gradient: string;
  scoreMode: ScoreMode;
  scoreLabel: string;
};

export const GAME_CATALOG: GameDef[] = [
  {
    id: 'minesweeper',
    emoji: '🧩',
    title: 'Minesweeper',
    tagline: 'Perfect 5-min break',
    gradient: 'from-slate-500 to-stone-700',
    scoreMode: 'lower',
    scoreLabel: 'Time (sec)',
  },
  {
    id: 'hangman',
    emoji: '🔤',
    title: 'Hangman',
    tagline: 'Word guesses, easy rounds',
    gradient: 'from-zinc-500 to-neutral-700',
    scoreMode: 'higher',
    scoreLabel: 'Words cleared',
  },
  {
    id: 'whack',
    emoji: '🔨',
    title: 'Whack-a-Mole',
    tagline: 'Stress relief after meetings',
    gradient: 'from-yellow-400 to-amber-600',
    scoreMode: 'higher',
    scoreLabel: 'Hits',
  },
];

export function getGame(id: string) {
  return GAME_CATALOG.find((g) => g.id === id);
}
