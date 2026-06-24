import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  MapPin,
  Phone,
  Search,
  User,
} from 'lucide-react';
import { api } from '@/lib/api';
import { ProfilePhotoImg } from '@/components/ui/ProfilePhotoImg';

export type EmployeeDirectoryEntry = {
  id: number;
  name: string;
  email?: string | null;
  designation: string;
  department?: string | null;
  employeecode?: string | null;
  phone?: string | null;
  location?: string | null;
  dateOfJoining?: string | null;
  hobbies: string;
  profilePhotoUrl?: string | null;
  depth: number;
};

type DirectoryResponse = {
  employees: EmployeeDirectoryEntry[];
  total: number;
};

const PAGE_SIZE = 8;

function initials(name: string) {
  return (name.trim()[0] || '?').toUpperCase();
}

function formatJoinDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function formatTenure(value: string | null | undefined) {
  if (!value) return '—';
  const joined = new Date(value);
  if (Number.isNaN(joined.getTime())) return '—';

  const now = new Date();
  let years = now.getFullYear() - joined.getFullYear();
  let months = now.getMonth() - joined.getMonth();
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return '—';

  const yearLabel = years === 1 ? 'Year' : 'Years';
  const monthLabel = months === 1 ? 'Month' : 'Months';
  if (years === 0 && months === 0) return 'Less than 1 month';
  if (years === 0) return `${months} ${monthLabel}`;
  if (months === 0) return `${years} ${yearLabel}`;
  return `${years} ${yearLabel} ${months} ${monthLabel}`;
}

function usernameFor(person: EmployeeDirectoryEntry) {
  const code = person.employeecode?.trim();
  if (code) return code;
  const email = person.email?.trim();
  if (email) return email.split('@')[0] || email;
  return '—';
}

function InfoRow({ icon: Icon, children }: { icon: typeof Phone; children: ReactNode }) {
  return (
    <div className="employee-directory-card-info">
      <Icon size={14} strokeWidth={2} aria-hidden />
      <span>{children}</span>
    </div>
  );
}

function EmployeeDirectoryCard({ person }: { person: EmployeeDirectoryEntry }) {
  const email = person.email?.trim() || '';
  const phone = person.phone?.trim() || '';

  return (
    <article className="employee-directory-card" role="listitem">
      <div className="employee-directory-card-banner" aria-hidden />
      <div className="employee-directory-card-inner">
        <div className="employee-directory-card-photo-wrap">
          <ProfilePhotoImg
            src={person.profilePhotoUrl ?? null}
            employeeId={person.id}
            className="employee-directory-card-photo"
            fallback={
              <span className="employee-directory-card-photo employee-directory-card-photo-fallback">
                {initials(person.name)}
              </span>
            }
          />
          <span className="employee-directory-card-status" title="Active employee" />
        </div>

        <h3 className="employee-directory-card-name">{person.name}</h3>
        <p className="employee-directory-card-designation">{person.designation || '—'}</p>

        <div className="employee-directory-card-details">
          <div className="employee-directory-card-column">
            <InfoRow icon={Phone}>{phone || '—'}</InfoRow>
            <InfoRow icon={MapPin}>{person.location?.trim() || '—'}</InfoRow>
            <InfoRow icon={Calendar}>{formatJoinDate(person.dateOfJoining)}</InfoRow>
          </div>
          <div className="employee-directory-card-column">
            <InfoRow icon={User}>{usernameFor(person)}</InfoRow>
            <InfoRow icon={Mail}>{email || '—'}</InfoRow>
            <InfoRow icon={Clock}>{formatTenure(person.dateOfJoining)}</InfoRow>
          </div>
        </div>

        {(email || phone) ? (
          <div className="employee-directory-card-footer">
            <div className="employee-directory-card-actions">
              {email ? (
                <a href={`mailto:${email}`} className="employee-directory-card-action" title="Email">
                  <Mail size={15} aria-hidden />
                </a>
              ) : null}
              {phone ? (
                <a href={`tel:${phone}`} className="employee-directory-card-action" title="Call">
                  <Phone size={15} aria-hidden />
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | 'ellipsis')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i += 1) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('ellipsis');
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i += 1) pages.push(i);
    if (page < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
  }

  return (
    <nav className="employee-directory-pagination" aria-label="Employee directory pages">
      <button
        type="button"
        className="employee-directory-page-btn"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((item, index) =>
        item === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className="employee-directory-page-ellipsis">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={`employee-directory-page-btn${item === page ? ' employee-directory-page-btn--active' : ''}`}
            onClick={() => onChange(item)}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </button>
        )
      )}
      <button
        type="button"
        className="employee-directory-page-btn"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

export function EmployeeDirectoryPanel() {
  const [employees, setEmployees] = useState<EmployeeDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api<DirectoryResponse>('/api/users/employee-directory');
        if (!cancelled) {
          setEmployees(data.employees || []);
          setPage(1);
        }
      } catch (e) {
        if (!cancelled) {
          setEmployees([]);
          setError(e instanceof Error ? e.message : 'Could not load employee directory');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((person) => person.name.toLowerCase().includes(query));
  }, [employees, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
  const pageIndex = Math.min(page, totalPages);
  const pageStart = (pageIndex - 1) * PAGE_SIZE;
  const pageEmployees = filteredEmployees.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search]);

  if (loading) {
    return <p className="stat-sub">Loading employee directory…</p>;
  }

  if (error) {
    return <p className="stat-sub">{error}</p>;
  }

  if (!employees.length) {
    return <p className="stat-sub">No employees in the directory yet.</p>;
  }

  return (
    <div className="employee-directory-panel">
      <div className="employee-directory-head">
        <div className="employee-directory-head-main">
          <h2 className="panel-title">Employee directory</h2>
          <p className="stat-sub">
            {search.trim()
              ? `${filteredEmployees.length} of ${employees.length} colleagues`
              : `${employees.length} colleagues`}{' '}
            · page {pageIndex} of {totalPages}
          </p>
        </div>
        <label className="employee-directory-search">
          <Search size={15} aria-hidden className="employee-directory-search-icon" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
            aria-label="Search employees by name"
            className="employee-directory-search-input"
          />
        </label>
      </div>

      {!pageEmployees.length ? (
        <p className="stat-sub">No employees match &ldquo;{search.trim()}&rdquo;.</p>
      ) : (
        <div className="employee-directory-grid" role="list">
          {pageEmployees.map((person) => (
            <EmployeeDirectoryCard key={person.id} person={person} />
          ))}
        </div>
      )}

      <Pagination page={pageIndex} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
