import type { OrgDirectoryResponse } from '@/features/team-hub/orgDirectory';
import { formatDisplayDate } from '@/lib/formatDate';
import type { OrgPerson } from './types';

export type DirectoryPerson = {
  id: number;
  name: string;
  email?: string | null;
  title: string;
  designation?: string | null;
  department?: string | null;
  employeecode?: string | null;
  phone?: string | null;
  location?: string | null;
  dateOfBirth?: string | null;
  bio?: string | null;
  profilePhotoUrl?: string | null;
};

export function normalizePersonName(name: string) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function coerceEmployeeId(id: unknown): number | null {
  if (id == null || id === '') return null;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function mapDirectoryPerson(person: OrgDirectoryResponse['sections'][0]['people'][0]): DirectoryPerson {
  return {
    id: person.id,
    name: person.name,
    email: person.email ?? null,
    title: person.title,
    designation: person.designation ?? null,
    department: person.department ?? null,
    employeecode: person.employeecode ?? null,
    phone: person.phone ?? null,
    location: person.location ?? null,
    dateOfBirth: person.dateOfBirth ?? null,
    bio: person.bio ?? null,
    profilePhotoUrl: person.profilePhotoUrl ?? null,
  };
}

/** All registered HRMS employees — used live for org chart photos and contact fields. */
export function flattenDirectory(response: OrgDirectoryResponse): DirectoryPerson[] {
  if (response.allPeople?.length) {
    return response.allPeople.map(mapDirectoryPerson);
  }

  const out: DirectoryPerson[] = [];
  for (const section of response.sections || []) {
    for (const person of section.people || []) {
      out.push(mapDirectoryPerson(person));
    }
  }
  return out;
}

function directoryById(directory: DirectoryPerson[]) {
  const map = new Map<number, DirectoryPerson>();
  for (const person of directory) {
    map.set(person.id, person);
  }
  return map;
}

function buildLookup(people: DirectoryPerson[]) {
  const byId = new Map<number, DirectoryPerson>();
  const byName = new Map<string, DirectoryPerson[]>();

  for (const person of people) {
    byId.set(person.id, person);
    const key = normalizePersonName(person.name);
    const list = byName.get(key) ?? [];
    list.push(person);
    byName.set(key, list);
  }

  return { byId, byName };
}

export function resolveDirectoryPerson(
  node: Pick<OrgPerson, 'employeeId' | 'name'> & { tags?: OrgPerson['tags'] },
  directory: DirectoryPerson[]
): DirectoryPerson | null {
  if (!directory.length) return null;

  const linkedId = coerceEmployeeId(node.employeeId);
  if (linkedId != null) {
    return directoryById(directory).get(linkedId) ?? null;
  }

  const lookup = buildLookup(directory);
  const key = normalizePersonName(node.name);
  if (!key) return null;

  const exact = lookup.byName.get(key);
  if (exact?.length === 1) return exact[0];

  for (const tag of node.tags || []) {
    const code = String(tag).trim().toLowerCase();
    if (!code) continue;
    const byCode = directory.filter(
      (person) => String(person.employeecode || '').trim().toLowerCase() === code
    );
    if (byCode.length === 1) return byCode[0];
  }

  const all = [...lookup.byId.values()];
  const firstToken = key.split(' ')[0];
  if (firstToken) {
    const byFirst = all.filter((person) => {
      const directoryName = normalizePersonName(person.name);
      return directoryName === firstToken || directoryName.startsWith(`${firstToken} `);
    });
    if (byFirst.length === 1) return byFirst[0];
  }

  const partial = all.filter((person) => {
    const directoryName = normalizePersonName(person.name);
    return (
      directoryName === key ||
      directoryName.startsWith(`${key} `) ||
      key.startsWith(`${directoryName} `) ||
      directoryName.includes(key) ||
      key.includes(directoryName)
    );
  });
  if (partial.length === 1) return partial[0];

  return null;
}

export function getPersonEmployeeId(
  person: Pick<OrgPerson, 'employeeId' | 'name'> & { tags?: OrgPerson['tags'] },
  directory: DirectoryPerson[]
): number | null {
  return coerceEmployeeId(person.employeeId) ?? (resolveDirectoryPerson(person, directory)?.id ?? null);
}

/** Resolve designation/title from linked HRMS profile (admin designation takes priority). */
export function getPersonDisplayTitle(
  person: Pick<OrgPerson, 'employeeId' | 'name' | 'title'> & { tags?: OrgPerson['tags'] },
  directory: DirectoryPerson[]
): string {
  const linked = resolveDirectoryPerson(person, directory);
  if (linked?.designation?.trim()) return linked.designation.trim();
  if (linked?.title?.trim()) return linked.title.trim();
  return person.title?.trim() || '—';
}

export function getPersonDisplayDepartment(
  person: Pick<OrgPerson, 'employeeId' | 'name'> & { tags?: OrgPerson['tags'] },
  directory: DirectoryPerson[]
): string | null {
  const linked = resolveDirectoryPerson(person, directory);
  const department = linked?.department?.trim();
  return department || null;
}

/** Live name from HRMS employee profile. */
export function getPersonDisplayName(
  person: Pick<OrgPerson, 'employeeId' | 'name'> & { tags?: OrgPerson['tags'] },
  directory: DirectoryPerson[]
): string {
  const linked = resolveDirectoryPerson(person, directory);
  return linked?.name?.trim() || person.name?.trim() || '—';
}

export type PersonProfileDetails = {
  name: string;
  phone: string;
  dateOfBirth: string;
  about: string;
};

/** Name, phone, date of birth, and about — sourced from the employee profile. */
export function getPersonProfileDetails(
  person: Pick<OrgPerson, 'employeeId' | 'name'> & { tags?: OrgPerson['tags'] },
  directory: DirectoryPerson[]
): PersonProfileDetails {
  const linked = resolveDirectoryPerson(person, directory);
  return {
    name: linked?.name?.trim() || person.name?.trim() || '—',
    phone: linked?.phone?.trim() || '—',
    dateOfBirth: formatDisplayDate(linked?.dateOfBirth),
    about: linked?.bio?.trim() || '—',
  };
}

function photoFromDirectoryEntry(entry: DirectoryPerson | null | undefined): string | null {
  if (!entry) return null;
  if (entry.profilePhotoUrl?.startsWith('/uploads/profile-photos/')) {
    return entry.profilePhotoUrl;
  }
  if (entry.profilePhotoUrl) return entry.profilePhotoUrl;
  return null;
}

/** Live profile photo from HRMS employee profile (by id, then name match). */
export function getPersonDisplayPhoto(
  person: Pick<OrgPerson, 'employeeId' | 'name' | 'photo'> & { tags?: OrgPerson['tags'] },
  directory: DirectoryPerson[]
): string | null {
  const employeeId = getPersonEmployeeId(person, directory);
  if (employeeId != null) {
    const byId = directoryById(directory).get(employeeId);
    const fromProfile = photoFromDirectoryEntry(byId);
    if (fromProfile) return fromProfile;
    if (person.photo) return person.photo;
  }

  const linked = resolveDirectoryPerson(person, directory);
  const fromLinked = photoFromDirectoryEntry(linked);
  if (fromLinked) return fromLinked;

  return person.photo ?? null;
}
