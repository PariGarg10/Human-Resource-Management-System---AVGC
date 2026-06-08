import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { ProfilePhotoImg } from '@/components/ui/ProfilePhotoImg';
import {
  personDesignation,
  type OrgDirectoryResponse,
  type OrgPerson,
  type OrgSection,
} from '@/features/team-hub/orgDirectory';
import { hasEmployeeAccess } from '@/lib/roles';
import { EmotionIcons } from '@/components/ui/EmotionIcons';
import { useUser } from '@/context/UserContext';

function parseBioExtras(bio?: string | null) {
  if (!bio) return { hobbies: '—', funFact: '—' };
  const hobbiesMatch = bio.match(/hobbies?:\s*(.+?)(?:\||\n|fun|$)/i);
  const funMatch = bio.match(/fun\s*fact:\s*(.+)/i);
  return {
    hobbies: hobbiesMatch?.[1]?.trim() || '—',
    funFact: funMatch?.[1]?.trim() || '—',
  };
}

type DetailState = {
  person: OrgPerson;
  hobbies: string;
  funFact: string;
  managerName: string;
};

export function EmployeeProfilesPanel({ scope = 'all' }: { scope?: 'all' | 'same-team' }) {
  const { user } = useUser();
  const [sections, setSections] = useState<OrgSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [allPeople, setAllPeople] = useState<OrgPerson[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api<OrgDirectoryResponse>('/api/users/org-directory');
        if (cancelled) return;
        const rawSections = data.sections || [];
        const flat = rawSections.flatMap((s) => s.people);
        setAllPeople(flat);
        if (scope === 'same-team' && user?.department) {
          const teamSections = rawSections
            .map((section) => ({
              ...section,
              people: section.people.filter(
                (person) =>
                  String(person.department || '').trim().toLowerCase() ===
                  String(user.department || '').trim().toLowerCase()
              ),
            }))
            .filter((section) => section.people.length > 0);
          setSections(teamSections);
        } else {
          setSections(rawSections);
        }
      } catch {
        if (!cancelled) setSections([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, user?.department]);

  const peopleCount = useMemo(() => sections.reduce((n, s) => n + s.people.length, 0), [sections]);

  async function openDetail(person: OrgPerson) {
    let hobbies = '—';
    let funFact = '—';
    if (person.id === user?.id) {
      try {
        const data = await api<{ profile: { bio?: string | null; designation?: string | null } }>('/api/users/me');
        const extras = parseBioExtras(data.profile.bio);
        hobbies = extras.hobbies;
        funFact = extras.funFact;
      } catch {
        /* keep defaults */
      }
    }
    let managerName = '—';
    if (hasEmployeeAccess(user?.role) && person.id === user?.id && user.reportingToId) {
      const mgr = allPeople.find((p) => p.id === user.reportingToId);
      managerName = mgr?.name || '—';
    }
    setDetail({ person, hobbies, funFact, managerName });
  }

  if (loading) return <p className="stat-sub">Loading employee profiles…</p>;
  if (!sections.length) return <p className="stat-sub">No employee profiles available yet.</p>;

  return (
    <>
      <p className="stat-sub" style={{ marginBottom: 16 }}>
        {peopleCount} colleagues — click a card for details.
      </p>
      {sections.map((section) => (
        <section key={section.id} style={{ marginBottom: 24 }}>
          <h3 className="panel-title" style={{ fontSize: '0.95rem', marginBottom: 12 }}>
            {section.label}
          </h3>
          <div className="tile-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {section.people.map((person) => (
              <button
                key={person.id}
                type="button"
                className="tile"
                style={{ textAlign: 'center', cursor: 'pointer', border: '1px solid var(--border)' }}
                onClick={() => openDetail(person)}
              >
                <ProfilePhotoImg
                  src={person.profilePhotoUrl ?? null}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    margin: '0 auto 8px',
                    display: 'block',
                  }}
                  fallback={
                    <span
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: '50%',
                        display: 'block',
                        margin: '0 auto 8px',
                        background: 'var(--border)',
                      }}
                    />
                  }
                />
                <strong style={{ display: 'block', fontSize: '0.9rem' }}>{person.name}</strong>
                <span className="stat-sub" style={{ fontSize: '0.75rem' }}>
                  {personDesignation(person)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {detail && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => setDetail(null)}
        >
          <div
            className="panel"
            style={{ maxWidth: 420, width: '100%', margin: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <ProfilePhotoImg
                src={detail.person.profilePhotoUrl ?? null}
                style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }}
                fallback={
                  <span
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: '50%',
                      display: 'block',
                      background: 'var(--border)',
                    }}
                  />
                }
              />
              <div>
                <h2 className="panel-title" style={{ margin: 0 }}>
                  {detail.person.name}
                </h2>
                <p className="stat-sub" style={{ margin: '4px 0 0' }}>
                  {personDesignation(detail.person)}
                </p>
              </div>
            </div>
            <dl style={{ marginTop: 16, display: 'grid', gap: 8, fontSize: '0.9rem' }}>
              <div>
                <dt className="stat-label">Emp Code</dt>
                <dd style={{ margin: 0 }}>{detail.person.employeecode || '—'}</dd>
              </div>
              <div>
                <dt className="stat-label">Designation</dt>
                <dd style={{ margin: 0 }}>{personDesignation(detail.person)}</dd>
              </div>
              <div>
                <dt className="stat-label">Department</dt>
                <dd style={{ margin: 0 }}>{detail.person.department || '—'}</dd>
              </div>
              {hasEmployeeAccess(user?.role) && detail.person.id === user?.id ? (
                <div>
                  <dt className="stat-label">Reporting team lead</dt>
                  <dd style={{ margin: 0 }}>{detail.managerName}</dd>
                </div>
              ) : null}
              <div>
                <dt className="stat-label">Hobbies</dt>
                <dd style={{ margin: 0 }}>{detail.hobbies}</dd>
              </div>
              <div>
                <dt className="stat-label">Fun fact</dt>
                <dd style={{ margin: 0 }}>{detail.funFact}</dd>
              </div>
            </dl>
            <p className="stat-label" style={{ marginTop: 16, marginBottom: 6 }}>
              Mood
            </p>
            <EmotionIcons size="sm" />
            <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 16 }} onClick={() => setDetail(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
