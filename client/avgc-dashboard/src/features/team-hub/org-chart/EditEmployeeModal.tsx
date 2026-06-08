import { useEffect, useState } from 'react';
import type { DirectoryPerson } from './syncOrgProfiles';
import type { OrgLevel, OrgPerson, OrgStatus, UpdateEmployeeInput } from './types';

type Props = {
  open: boolean;
  person: OrgPerson | null;
  directory: DirectoryPerson[];
  onClose: () => void;
  onSubmit: (input: UpdateEmployeeInput) => void;
};

const LEVELS: OrgLevel[] = ['root', 'c-suite', 'director', 'manager', 'lead', 'intern'];
const STATUSES: OrgStatus[] = ['online', 'away', 'offline'];

export function EditEmployeeModal({ open, person, directory, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<OrgLevel>('intern');
  const [status, setStatus] = useState<OrgStatus>('online');
  const [skillsRaw, setSkillsRaw] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [useProfilePhoto, setUseProfilePhoto] = useState(true);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!person) return;
    setName(person.name);
    setTitle(person.title);
    setLevel(person.level);
    setStatus(person.status);
    setSkillsRaw(person.skills.join(', '));
    setTagsRaw(person.tags.join(', '));
    setEmployeeId(person.employeeId != null ? String(person.employeeId) : '');
    setUseProfilePhoto(!person.photo || person.photo.startsWith('/'));
    setPhoto(person.photo);
    setError('');
  }, [person, open]);

  if (!open || !person) return null;

  function splitList(raw: string) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function handlePhoto(file: File | undefined) {
    if (!file) {
      setPhoto(null);
      setUseProfilePhoto(true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(String(reader.result));
      setUseProfilePhoto(false);
    };
    reader.readAsDataURL(file);
  }

  function handleEmployeeLink(value: string) {
    setEmployeeId(value);
    if (!value) return;
    const linked = directory.find((d) => String(d.id) === value);
    if (!linked) return;
    if (useProfilePhoto && linked.profilePhotoUrl) {
      setPhoto(linked.profilePhotoUrl);
    }
  }

  function handleSubmit() {
    if (!name.trim() || !title.trim()) {
      setError('Name and Job Title are required.');
      return;
    }
    setError('');

    let resolvedPhoto = photo;
    if (useProfilePhoto && employeeId) {
      const linked = directory.find((d) => String(d.id) === employeeId);
      resolvedPhoto = linked?.profilePhotoUrl ?? null;
    }

    onSubmit({
      name: name.trim(),
      title: title.trim(),
      level,
      status,
      photo: resolvedPhoto,
      employeeId: employeeId ? Number(employeeId) : null,
      skills: splitList(skillsRaw),
      tags: splitList(tagsRaw),
    });
  }

  const previewPhoto =
    useProfilePhoto && employeeId
      ? directory.find((d) => String(d.id) === employeeId)?.profilePhotoUrl ?? photo
      : photo;

  return (
    <div className="org-modal-backdrop" onClick={onClose} role="presentation">
      <div className="org-modal" role="dialog" aria-labelledby="org-edit-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="org-edit-title">Edit team member</h2>
        <p className="org-modal__hint">Link an HRMS employee to keep name and photo in sync with their profile.</p>
        <p className="org-modal__error">{error}</p>

        <label htmlFor="org-edit-link">Link to HRMS employee</label>
        <select id="org-edit-link" value={employeeId} onChange={(e) => handleEmployeeLink(e.target.value)}>
          <option value="">— Not linked —</option>
          {directory.map((d) => (
            <option key={d.id} value={String(d.id)}>
              {d.name} ({d.title})
            </option>
          ))}
        </select>

        <label htmlFor="org-edit-name">Full Name</label>
        <input id="org-edit-name" value={name} onChange={(e) => setName(e.target.value)} />

        <label htmlFor="org-edit-title-input">Job Title</label>
        <input id="org-edit-title-input" value={title} onChange={(e) => setTitle(e.target.value)} />

        <label className="org-modal__checkbox">
          <input
            type="checkbox"
            checked={useProfilePhoto}
            onChange={(e) => setUseProfilePhoto(e.target.checked)}
          />
          Use profile photo from employee portal
        </label>

        {!useProfilePhoto ? (
          <>
            <label htmlFor="org-edit-photo">Custom photo</label>
            <input id="org-edit-photo" type="file" accept="image/*" onChange={(e) => handlePhoto(e.target.files?.[0])} />
          </>
        ) : null}

        {previewPhoto ? (
          <div className="org-modal__photo-preview">
            <img src={previewPhoto} alt="" />
          </div>
        ) : null}

        <label htmlFor="org-edit-level">Level</label>
        <select
          id="org-edit-level"
          value={level}
          onChange={(e) => setLevel(e.target.value as OrgLevel)}
          disabled={person.level === 'root'}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        <label htmlFor="org-edit-skills">Skills (comma separated)</label>
        <input id="org-edit-skills" value={skillsRaw} onChange={(e) => setSkillsRaw(e.target.value)} />

        <label htmlFor="org-edit-tags">Tags (comma separated)</label>
        <input id="org-edit-tags" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} />

        <label htmlFor="org-edit-status">Status</label>
        <select id="org-edit-status" value={status} onChange={(e) => setStatus(e.target.value as OrgStatus)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="org-modal__actions">
          <button type="button" className="org-modal__cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="org-modal__submit" onClick={handleSubmit}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
