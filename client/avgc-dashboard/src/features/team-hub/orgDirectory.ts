export type OrgPerson = {
  id: number;
  name: string;
  email?: string | null;
  title: string;
  designation?: string | null;
  department: string | null;
  role: string;
  employeecode?: string;
  phone?: string | null;
  location?: string | null;
  profilePhotoUrl?: string | null;
};

/** Prefer admin-set designation; fall back to directory title. */
export function personDesignation(person: Pick<OrgPerson, 'designation' | 'title'>): string {
  const d = person.designation?.trim();
  if (d) return d;
  return person.title?.trim() || '—';
}

export type OrgSection = {
  id: string;
  label: string;
  people: OrgPerson[];
};

export type OrgDirectoryResponse = {
  sections: OrgSection[];
  /** Every registered employee — used by org chart for live profile photo lookup. */
  allPeople?: OrgPerson[];
  total: number;
};

export function avatarUrl(person: OrgPerson) {
  if (person.profilePhotoUrl) return person.profilePhotoUrl;
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(person.employeecode || person.name)}`;
}
