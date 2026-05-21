export type OrgPerson = {
  id: number;
  name: string;
  title: string;
  department: string | null;
  role: string;
  employeecode?: string;
  profilePhotoUrl?: string | null;
};

export type OrgSection = {
  id: string;
  label: string;
  people: OrgPerson[];
};

export type OrgDirectoryResponse = {
  sections: OrgSection[];
  total: number;
};

export function avatarUrl(person: OrgPerson) {
  if (person.profilePhotoUrl) return person.profilePhotoUrl;
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(person.employeecode || person.name)}`;
}
