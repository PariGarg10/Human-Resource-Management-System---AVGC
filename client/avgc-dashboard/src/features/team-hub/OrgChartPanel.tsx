import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { avatarUrl, type OrgDirectoryResponse, type OrgSection } from '@/features/team-hub/orgDirectory';
import { useUser } from '@/context/UserContext';

export function OrgChartPanel({ scope = 'all' }: { scope?: 'all' | 'same-team' }) {
  const { user } = useUser();
  const [sections, setSections] = useState<OrgSection[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api<OrgDirectoryResponse>('/api/users/org-directory');
        if (cancelled) return;
        const rawSections = data.sections || [];
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
          setTotal(teamSections.reduce((sum, section) => sum + section.people.length, 0));
        } else {
          setSections(rawSections);
          setTotal(data.total ?? 0);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load team directory');
        setSections([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, user?.department]);

  if (loading) {
    return (
      <div className="font-['DM_Sans',sans-serif]">
        <p className="text-sm text-[var(--text-muted)]">Loading team directory…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="font-['DM_Sans',sans-serif]">
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      </div>
    );
  }

  if (!sections.length) {
    return (
      <div className="font-['DM_Sans',sans-serif]">
        <p className="text-sm text-[var(--text-muted)]">
          {scope === 'same-team'
            ? 'No team members found for your department yet.'
            : 'No employees in HRMS yet. Import or add employees in Admin → Employees.'}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full font-['DM_Sans',sans-serif]">
      <p className="mb-6 text-sm text-[var(--text-muted)]">
        {scope === 'same-team'
          ? `${total} teammates from your department.`
          : `${total} people from your HRMS employee list — grouped by role and department.`}
      </p>
      {sections.map((section) => (
        <section key={section.id} className="mb-8">
          <span className="mb-4 inline-block rounded-full bg-[var(--red-soft)] px-5 py-2 text-xs font-bold uppercase tracking-wider text-avgc-brand">
            {section.label}
          </span>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {section.people.length === 0 ? (
              <article className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] px-3 py-5 text-center text-sm italic text-[var(--text-muted)] shadow-sm">
                Founder not found in employee records.
              </article>
            ) : (
              section.people.map((person) => (
                <article
                  key={person.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-5 text-center shadow-sm"
                >
                  <img
                    src={avatarUrl(person)}
                    alt=""
                    className="mx-auto mb-3 h-[72px] w-[72px] rounded-full border-2 border-[var(--border)] object-cover"
                  />
                  <p className="text-sm font-bold text-[var(--text-primary)]">{person.name}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{person.title}</p>
                  {person.department && person.department !== person.title ? (
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{person.department}</p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
