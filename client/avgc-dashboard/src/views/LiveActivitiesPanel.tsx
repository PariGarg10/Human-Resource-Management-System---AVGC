import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { PortalRole } from '@/lib/portalNav';

type ActivityLink = {
  id: number;
  title: string;
  url: string;
  description?: string | null;
  createdBy?: string | null;
  createdAt: string;
};

type Nominee = {
  id: number;
  code: string;
  name: string;
  department?: string | null;
  designation?: string | null;
  isTeamLead?: boolean;
};

type Winner = {
  id: number;
  category: 'mvp' | 'team_lead';
  message?: string | null;
  createdAt: string;
  employeeId: number;
  name: string;
  designation?: string | null;
  department?: string | null;
};

type Props = {
  portalRole: PortalRole;
  mode: 'links' | 'nominations';
};

function categoryLabel(category: 'mvp' | 'team_lead') {
  return category === 'mvp' ? 'MVP' : 'Most Valuable Team Lead';
}

function WinnersBanner({ winners }: { winners: Winner[] }) {
  if (!winners.length) return null;
  return (
    <div className="live-winners">
      {winners.map((winner) => (
        <article key={winner.id} className="live-winner-card">
          <p className="live-eyebrow">{categoryLabel(winner.category)} winner</p>
          <h3>{winner.name}</h3>
          <p>{winner.designation || winner.department || 'AVGCian'}</p>
          {winner.message ? <span>{winner.message}</span> : null}
        </article>
      ))}
    </div>
  );
}

export function LiveActivitiesPanel({ portalRole, mode }: Props) {
  const [links, setLinks] = useState<ActivityLink[]>([]);
  const [nominees, setNominees] = useState<Nominee[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [category, setCategory] = useState<'mvp' | 'team_lead'>('mvp');
  const [nomineeId, setNomineeId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);

  const canNominateTeamLead = portalRole === 'manager';
  const visibleNominees = useMemo(() => {
    if (category !== 'team_lead') return nominees;
    return nominees.filter((n) => n.isTeamLead || /lead/i.test(n.designation || ''));
  }, [category, nominees]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linksData, winnersData, nomineesData] = await Promise.all([
        api<{ links: ActivityLink[] }>('/api/live-activities/links'),
        api<{ winners: Winner[] }>('/api/live-activities/winners'),
        api<{ employees: Nominee[] }>('/api/live-activities/nominees'),
      ]);
      setLinks(linksData.links || []);
      setWinners(winnersData.winners || []);
      setNominees(nomineesData.employees || []);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load live activities', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function submitNomination(event: React.FormEvent) {
    event.preventDefault();
    if (!nomineeId) {
      toast('Choose an AVGCian to nominate', 'error');
      return;
    }
    try {
      await api('/api/live-activities/nominations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          nomineeId: Number(nomineeId),
          reason,
        }),
      });
      toast('Nomination saved', 'success');
      setNomineeId('');
      setReason('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save nomination', 'error');
    }
  }

  if (mode === 'links') {
    return (
      <div className="panel live-activities-panel panel--scroll">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Live activities</h2>
            <p className="stat-sub">Activity links shared by HR and admin.</p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => load().catch(() => {})}>
            Refresh
          </button>
        </div>
        <WinnersBanner winners={winners} />
        <div className="live-link-grid">
          {loading ? (
            <p className="stat-sub">Loading activity links...</p>
          ) : links.length ? (
            links.map((link) => (
              <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="live-link-card">
                <span className="live-eyebrow">Activity link</span>
                <strong>{link.title}</strong>
                {link.description ? <p>{link.description}</p> : null}
                <small>{link.createdBy ? `Shared by ${link.createdBy}` : 'Open activity'}</small>
              </a>
            ))
          ) : (
            <p className="stat-sub">No activity links have been shared yet.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="panel live-activities-panel panel--scroll">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Nominations</h2>
          <p className="stat-sub">
            Nominate {canNominateTeamLead ? 'MVPs and valuable team leads' : 'an MVP'} for live activities.
          </p>
        </div>
      </div>
      <WinnersBanner winners={winners} />
      <form className="live-nomination-form" onSubmit={submitNomination}>
        {canNominateTeamLead ? (
          <label>
            Nomination type
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as 'mvp' | 'team_lead');
                setNomineeId('');
              }}
            >
              <option value="mvp">MVP</option>
              <option value="team_lead">Most Valuable Team Lead</option>
            </select>
          </label>
        ) : null}
        <label>
          AVGCian
          <select value={nomineeId} onChange={(event) => setNomineeId(event.target.value)}>
            <option value="">Choose nominee</option>
            {visibleNominees.map((nominee) => (
              <option key={nominee.id} value={nominee.id}>
                {nominee.name} ({nominee.designation || nominee.department || nominee.code})
              </option>
            ))}
          </select>
        </label>
        <label className="live-nomination-form__wide">
          Reason
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            placeholder="Why should this AVGCian be nominated?"
          />
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Submit nomination
          </button>
        </div>
      </form>
    </div>
  );
}
