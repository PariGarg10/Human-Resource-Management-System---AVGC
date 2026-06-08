import { useState } from 'react';
import type { NewEmployeeInput, OrgLevel, OrgStatus } from './types';

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: NewEmployeeInput) => void;
};

const LEVELS: OrgLevel[] = ['c-suite', 'director', 'manager', 'lead', 'intern'];
const STATUSES: OrgStatus[] = ['online', 'away', 'offline'];

export function AddEmployeeModal({ open, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<OrgLevel>('intern');
  const [status, setStatus] = useState<OrgStatus>('online');
  const [skillsRaw, setSkillsRaw] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!open) return null;

  function splitList(raw: string) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function handlePhoto(file: File | undefined) {
    if (!file) {
      setPhoto(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  }

  function handleSubmit() {
    if (!name.trim() || !title.trim()) {
      setError('Name and Job Title are required.');
      return;
    }
    setError('');
    onSubmit({
      name: name.trim(),
      title: title.trim(),
      level,
      status,
      photo,
      skills: splitList(skillsRaw),
      tags: splitList(tagsRaw),
    });
    setName('');
    setTitle('');
    setLevel('intern');
    setStatus('online');
    setSkillsRaw('');
    setTagsRaw('');
    setPhoto(null);
  }

  return (
    <div className="org-modal-backdrop" onClick={onClose} role="presentation">
      <div className="org-modal" role="dialog" aria-labelledby="org-add-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="org-add-title">Add team member</h2>
        <p className="org-modal__error">{error}</p>
        <label htmlFor="org-add-name">Full Name</label>
        <input id="org-add-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Employee name" />
        <label htmlFor="org-add-title-input">Job Title</label>
        <input
          id="org-add-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Job title"
        />
        <label htmlFor="org-add-photo">Upload Photo (optional)</label>
        <input id="org-add-photo" type="file" accept="image/*" onChange={(e) => handlePhoto(e.target.files?.[0])} />
        <label htmlFor="org-add-level">Level</label>
        <select id="org-add-level" value={level} onChange={(e) => setLevel(e.target.value as OrgLevel)}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <label htmlFor="org-add-skills">Skills (comma separated)</label>
        <input id="org-add-skills" value={skillsRaw} onChange={(e) => setSkillsRaw(e.target.value)} placeholder="Python, Leadership" />
        <label htmlFor="org-add-tags">Tags (comma separated)</label>
        <input id="org-add-tags" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="Architecture, Backend" />
        <label htmlFor="org-add-status">Status</label>
        <select id="org-add-status" value={status} onChange={(e) => setStatus(e.target.value as OrgStatus)}>
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
            Add to Team
          </button>
        </div>
      </div>
    </div>
  );
}
