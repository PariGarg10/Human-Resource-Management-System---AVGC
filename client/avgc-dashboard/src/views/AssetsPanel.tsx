import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDisplayDate } from '@/lib/formatDate';
import { toast } from '@/lib/toast';

type MyAllocation = {
  id: number;
  itemName: string;
  itemCategory: string;
  allocatedAt: string;
  allocatedAtFormatted?: string;
  status: string;
  notes?: string | null;
};

export function AssetsPanel() {
  const [rows, setRows] = useState<MyAllocation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api<{ allocations: MyAllocation[] }>('/api/assets/my-allocations');
      setRows(data.allocations || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load assets', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return (
    <div className="panel">
      <h2 className="panel-title">My allocated assets</h2>
      <p className="stat-sub">Equipment and assets assigned to you.</p>
      {loading ? (
        <p className="stat-sub" style={{ marginTop: 16 }}>
          Loading…
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Item name</th>
                <th>Category</th>
                <th>Allocated on</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="stat-sub">
                    No assets allocated yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.itemName}</td>
                    <td>{row.itemCategory}</td>
                    <td>{row.allocatedAtFormatted || formatDisplayDate(row.allocatedAt)}</td>
                    <td>{row.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
