import { useCallback, useEffect, useState } from 'react';
import { GAME_CATALOG, getGame } from './gameCatalog';
import { GAME_COMPONENTS } from './ArcadeSuite';

type Tournament = {
  id: string;
  gameId: string;
  title: string;
  status: string;
  startedAt: number;
  endsAt: number | null;
  winner?: { name: string; score: number } | null;
  leaderboard?: { name: string; score: number; employeeId: number }[];
};

function authHeaders(json = false) {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { ...authHeaders(Boolean(options.body)), ...(options.headers as Record<string, string>) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message || 'Request failed');
  return data as T;
}

type GamingArenaProps = {
  isAdminUser?: boolean;
  feedSlot?: React.ReactNode;
};

export function GamingArena({ isAdminUser = false, feedSlot }: GamingArenaProps) {
  const [tab, setTab] = useState<'arcade' | 'feed'>('arcade');
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [myScores, setMyScores] = useState<Record<string, number>>({});
  const [adminTournaments, setAdminTournaments] = useState<Tournament[]>([]);
  const [toast, setToast] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newGame, setNewGame] = useState('minesweeper');
  const [showAdmin, setShowAdmin] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<{ tournaments: Tournament[]; myScores: Record<string, number> }>('/api/social-tournaments');
      setTournaments(data.tournaments || []);
      setMyScores(data.myScores || {});
      if (isAdminUser) {
        const admin = await apiJson<{ tournaments: Tournament[] }>('/api/social-tournaments/admin');
        setAdminTournaments(admin.tournaments || []);
      }
    } catch {
      /* ignore */
    }
  }, [isAdminUser]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 8000);
    return () => window.clearInterval(id);
  }, [load]);

  const activeForGame = (gameId: string) => tournaments.find((t) => t.gameId === gameId);

  const submitScore = async (gameId: string, score: number) => {
    const t = activeForGame(gameId);
    if (!t) return;
    try {
      await apiJson(`/api/social-tournaments/${t.id}/scores`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ score }),
      });
      setToast(`🏆 Tournament score saved: ${score}`);
      load();
      setTimeout(() => setToast(''), 3000);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Could not save score');
    }
  };

  const createTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await apiJson('/api/social-tournaments', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ gameId: newGame, title: newTitle.trim() }),
      });
      setNewTitle('');
      setToast('🎉 Tournament is live!');
      load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed');
    }
  };

  const endTournament = async (id: string) => {
    try {
      const data = await apiJson<{ winner: { name: string; score: number } | null }>(`/api/social-tournaments/${id}/end`, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify({}),
      });
      setToast(data.winner ? `👑 Winner: ${data.winner.name} (${data.winner.score})` : 'Tournament ended');
      load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed');
    }
  };

  const GameComp = activeGame ? GAME_COMPONENTS[activeGame] : null;
  const gameMeta = activeGame ? getGame(activeGame) : null;

  return (
    <div className="avgc-gaming-portal space-y-6">
      {toast && (
        <div className="animate-pulse rounded-xl border border-violet-300 bg-gradient-to-r from-violet-100 to-fuchsia-100 px-4 py-3 text-sm font-bold text-violet-900">
          {toast}
        </div>
      )}

      {tournaments.length > 0 && (
        <div className="overflow-hidden rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 p-4 shadow-md">
          <p className="font-mono text-xs font-bold uppercase text-amber-700">🏆 Live tournaments</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tournaments.map((t) => {
              const g = getGame(t.gameId);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTab('arcade'); setActiveGame(t.gameId); }}
                  className="rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow hover:bg-amber-600"
                >
                  {g?.emoji} {t.title}
                  {myScores[t.id] != null ? ` · You: ${myScores[t.id]}` : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['arcade', 'feed'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setActiveGame(null); }}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-all ${
              tab === t ? 'bg-violet-600 text-white shadow-lg' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-violet-50'
            }`}
          >
            {t === 'arcade' ? '🎮 Arcade' : '📸 Feed'}
          </button>
        ))}
        {isAdminUser && (
          <button
            type="button"
            onClick={() => setShowAdmin((v) => !v)}
            className={`ml-auto rounded-full px-4 py-2 text-sm font-bold ${showAdmin ? 'bg-red-600 text-white' : 'bg-stone-900 text-white hover:bg-stone-700'}`}
          >
            ⚙️ Tournaments
          </button>
        )}
      </div>

      {showAdmin && isAdminUser && (
        <div className="rounded-2xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-orange-50 p-5 shadow-inner">
          <h3 className="text-lg font-black text-red-900">Admin — Create tournament</h3>
          <p className="mt-1 text-sm text-red-800">Pick a game. Everyone can play. Winner is revealed to admin only when you end the tournament.</p>
          <form onSubmit={createTournament} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Game
              <select value={newGame} onChange={(e) => setNewGame(e.target.value)} className="rounded-lg border border-stone-300 px-3 py-2">
                {GAME_CATALOG.map((g) => (
                  <option key={g.id} value={g.id}>{g.emoji} {g.title}</option>
                ))}
              </select>
            </label>
            <label className="min-w-[200px] flex-1 flex-col gap-1 text-sm font-semibold">
              Title
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Friday Snake Showdown" className="w-full rounded-lg border border-stone-300 px-3 py-2" required />
            </label>
            <button type="submit" className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-500">Launch tournament</button>
          </form>
          <div className="mt-6 space-y-3">
            {adminTournaments.map((t) => {
              const g = getGame(t.gameId);
              return (
                <div key={t.id} className="rounded-xl bg-white/80 p-4 ring-1 ring-stone-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold">{g?.emoji} {t.title}</span>
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${t.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-stone-200'}`}>{t.status}</span>
                    </div>
                    {t.status === 'active' && (
                      <button type="button" onClick={() => endTournament(t.id)} className="rounded-lg bg-stone-900 px-3 py-1 text-xs font-bold text-white">End & reveal winner</button>
                    )}
                  </div>
                  {t.status === 'ended' && t.winner && (
                    <p className="mt-2 text-sm font-bold text-amber-800">👑 Winner (admin only): {t.winner.name} — {t.winner.score} {g?.scoreLabel}</p>
                  )}
                  {t.leaderboard && t.leaderboard.length > 0 && (
                    <ol className="mt-2 space-y-1 text-sm text-stone-600">
                      {t.leaderboard.slice(0, 5).map((e, i) => (
                        <li key={i}>{i + 1}. {e.name} — {e.score}</li>
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'feed' && feedSlot}

      {tab === 'arcade' && !activeGame && (
        <div>
          <h2 className="font-sans text-3xl font-black text-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text">
            Pick a game!
          </h2>
          <p className="mt-1 text-sm text-stone-500">Offline mini-games — quick, colorful, coworker-friendly.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {GAME_CATALOG.map((g) => {
              const live = activeForGame(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveGame(g.id)}
                  className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${g.gradient} p-5 text-left text-white shadow-lg transition hover:scale-[1.02] hover:shadow-xl`}
                >
                  {live && (
                    <span className="absolute right-3 top-3 animate-bounce rounded-full bg-yellow-300 px-2 py-0.5 text-[10px] font-black text-yellow-900">LIVE</span>
                  )}
                  <span className="text-4xl" style={{ filter: 'none' }}>{g.emoji}</span>
                  <h3 className="mt-2 text-lg font-black">{g.title}</h3>
                  <p className="mt-1 text-sm text-white/90">{g.tagline}</p>
                  <span className="mt-4 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur group-hover:bg-white/30">Play now →</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'arcade' && activeGame && GameComp && gameMeta && (
        <div>
          <button
            type="button"
            onClick={() => setActiveGame(null)}
            className="mb-4 rounded-full bg-white px-4 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-200 hover:bg-violet-50"
          >
            ← Back to arcade
          </button>
          {activeForGame(activeGame) && (
            <p className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900">
              🏆 Tournament active: {activeForGame(activeGame)?.title} — your best {gameMeta.scoreLabel} counts!
            </p>
          )}
          <GameComp
            onFinish={(score) => {
              if (activeForGame(activeGame)) submitScore(activeGame, score);
            }}
          />
        </div>
      )}
    </div>
  );
}
