import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDisplayDate } from '@/lib/formatDate';
import { toast } from '@/lib/toast';

type PolicyRow = {
  id: number;
  title: string;
  description?: string | null;
  type: 'policy' | 'link';
  fileUrl?: string | null;
  externalUrl?: string | null;
  createdAt?: string;
  createdAtFormatted?: string;
};

export function PoliciesPanel() {
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api<{ policies: PolicyRow[] }>('/api/policies');
      setPolicies(data.policies || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load policies', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return (
    <div className="panel">
      <h2 className="panel-title">Policies &amp; important links</h2>
      <p className="stat-sub">Company policies and useful links.</p>
      {loading ? (
        <p className="stat-sub" style={{ marginTop: 16 }}>
          Loading…
        </p>
      ) : policies.length === 0 ? (
        <p className="stat-sub" style={{ marginTop: 16 }}>
          No policies added yet.
        </p>
      ) : (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {policies.map((p) => {
            const url = p.type === 'link' ? p.externalUrl : p.fileUrl;
            return (
              <div
                key={p.id}
                className="panel"
                style={{ margin: 0, padding: 16, boxShadow: 'none' }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <span className="badge pending" style={{ marginRight: 8 }}>
                      {p.type === 'link' ? 'Link' : 'Policy'}
                    </span>
                    <strong>{p.title}</strong>
                    {p.description ? (
                      <p className="stat-sub" style={{ margin: '6px 0 0' }}>
                        {p.description}
                      </p>
                    ) : null}
                    <p className="stat-sub" style={{ marginTop: 4 }}>
                      Added {p.createdAtFormatted || formatDisplayDate(p.createdAt)}
                    </p>
                  </div>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm"
                    >
                      {p.type === 'link' ? 'Open link' : 'Download'}
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
