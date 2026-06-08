import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDisplayDate } from '@/lib/formatDate';
import { toast } from '@/lib/toast';

type DocRow = {
  id: number;
  category: string;
  categoryLabel: string;
  originalName: string;
  source: 'employee' | 'admin';
  createdAt?: string;
};

type DocsResponse = {
  mine: DocRow[];
  fromAdmin: DocRow[];
  employeeCategories: string[];
  categories: Record<string, string>;
};

const EMPLOYEE_CATEGORY_LABELS: Record<string, string> = {
  aadhar: 'Aadhar card',
  pan: 'PAN card',
  education: 'Educational certificates',
  work_experience: 'Work experience',
};

async function openDocument(id: number) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/employee-documents/${id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || 'Could not open document');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function DocList({ rows, empty }: { rows: DocRow[]; empty: string }) {
  if (!rows.length) {
    return <small>{empty}</small>;
  }
  return (
    <ul className="profile-doc-list">
      {rows.map((row) => (
        <li key={row.id}>
          <span>
            {row.categoryLabel} — {row.originalName}
            {row.createdAt ? ` (${formatDisplayDate(row.createdAt)})` : ''}
          </span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => openDocument(row.id).catch((err) => toast(err.message, 'error'))}
          >
            View
          </button>
        </li>
      ))}
    </ul>
  );
}

export function EmployeeDocumentsSection() {
  const [mine, setMine] = useState<DocRow[]>([]);
  const [fromAdmin, setFromAdmin] = useState<DocRow[]>([]);
  const [category, setCategory] = useState('aadhar');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api<DocsResponse>('/api/employee-documents/mine');
      setMine(data.mine || []);
      setFromAdmin(data.fromAdmin || []);
      if (data.employeeCategories?.[0]) setCategory(data.employeeCategories[0]);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load documents', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('category', category);
      fd.append('file', file);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/employee-documents/mine', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      toast('Document uploaded', 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <label className="profile-field">
        <span>Document type</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.entries(EMPLOYEE_CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="profile-field">
        <span>Upload document</span>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={onUpload}
          disabled={uploading}
        />
        <small>PDF, JPG, PNG, DOC, or DOCX</small>
      </label>

      <div className="profile-field profile-field--wide">
        <span>Your uploads</span>
        {loading ? <small>Loading documents…</small> : <DocList rows={mine} empty="No documents uploaded yet." />}
      </div>

      <div className="profile-field profile-field--wide">
        <span>From admin / HR</span>
        {loading ? (
          <small>Loading…</small>
        ) : (
          <DocList rows={fromAdmin} empty="No admin documents shared yet." />
        )}
      </div>
    </>
  );
}
