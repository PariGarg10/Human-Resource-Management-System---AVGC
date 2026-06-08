import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { api, apiPatchProfile, persistEmployeePatch } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { EmployeeUser, UserProfile } from '@/types/employee';

export function ProfilePanel({
  user,
  onProfileSaved,
}: {
  user: EmployeeUser | null;
  onProfileSaved?: (u: EmployeeUser) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const blobRef = useRef<string | null>(null);
  const { setUser, setAvatarOverride } = useUser();

  const applyProfile = useCallback(
    (p: UserProfile) => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
      setAvatarOverride(null);
      setName(p.name || '');
      setEmail(p.email || '');
      setDepartment(p.department || '');
      setDesignation(p.designation || p.role || '');
      setPhone(p.phone || '');
      setLocation(p.location || '');
      setBio(p.bio || '');
      setDateOfBirth(p.dateOfBirth || '');
      setPreviewUrl(p.profilePhotoUrl || null);
      setFile(null);
    },
    [setAvatarOverride]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<{ profile: UserProfile }>('/api/users/me');
        if (!cancelled) applyProfile(data.profile);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : 'Could not load profile', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyProfile]);

  useEffect(() => {
    if (user?.profilePhotoUrl && !previewUrl && !file) {
      setPreviewUrl(user.profilePhotoUrl);
    }
  }, [user?.profilePhotoUrl, previewUrl, file]);

  useEffect(() => {
    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaveOk(false);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('phone', phone.trim());
      fd.append('location', location.trim());
      fd.append('bio', bio.trim());
      fd.append('dateOfBirth', dateOfBirth.trim());
      if (file) fd.append('profilePhoto', file);

      const { profile } = await apiPatchProfile(fd);
      applyProfile(profile);
      setFile(null);
      const merged = persistEmployeePatch(profile);
      setUser(merged);
      onProfileSaved?.(merged);
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
      setAvatarOverride(null);
      setSaveOk(true);
      toast('Profile saved successfully ✓', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  const derivedAge =
    dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
      ? (() => {
          const d = new Date(dateOfBirth + 'T12:00:00');
          if (Number.isNaN(d.getTime())) return null;
          const t = new Date();
          let a = t.getFullYear() - d.getFullYear();
          const m = t.getMonth() - d.getMonth();
          if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a -= 1;
          return a;
        })()
      : null;

  if (loading) {
    return (
      <div className="panel profile-panel-shell">
        <p className="stat-sub">Loading profile…</p>
      </div>
    );
  }

  return (
    <div className="panel profile-panel-shell">
      <h2 className="panel-title">{name.trim() || 'Profile'}</h2>
      <p className="stat-sub">
        Your name is managed by your administrator. Update contact details and photo below.
      </p>

      {saveOk && (
        <p className="message profile-save-msg" role="status">
          Profile saved successfully. Your photo is updated across the app.
        </p>
      )}

      <form onSubmit={onSubmit} className="profile-two-col">
        <aside className="profile-col profile-col--identity">
          <div className="profile-photo-card">
            <div className="profile-photo-frame">
              {previewUrl ? (
                <img src={previewUrl} alt="" />
              ) : (
                <span className="profile-photo-initial">
                  {(name || email || '?').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <label className="profile-upload-btn">
              <span>Change photo</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  if (!f) return;
                  const okType = /^image\/(jpeg|png|gif|webp)$/i.test(f.type);
                  if (!okType) {
                    toast('Please choose a JPEG, PNG, GIF, or WebP image.', 'error');
                    ev.target.value = '';
                    return;
                  }
                  if (f.size > 3 * 1024 * 1024) {
                    toast('Image must be 3MB or smaller.', 'error');
                    ev.target.value = '';
                    return;
                  }
                  setFile(f);
                  if (blobRef.current) URL.revokeObjectURL(blobRef.current);
                  const url = URL.createObjectURL(f);
                  blobRef.current = url;
                  setPreviewUrl(url);
                  setAvatarOverride(url);
                }}
              />
            </label>
          </div>

          <div className="profile-identity-tiles">
            <div className="profile-identity-tile">
              <span className="profile-identity-label">Full name</span>
              <strong>{name || '—'}</strong>
            </div>
            <div className="profile-identity-tile">
              <span className="profile-identity-label">Designation</span>
              <strong>{designation || '—'}</strong>
            </div>
            <div className="profile-identity-tile">
              <span className="profile-identity-label">Department</span>
              <strong>{department || '—'}</strong>
            </div>
            <div className="profile-identity-tile">
              <span className="profile-identity-label">Employee ID</span>
              <strong>{user?.employeecode || '—'}</strong>
            </div>
          </div>
        </aside>

        <div className="profile-col profile-col--fields">
          <div className="profile-fields-grid">
            <label className="profile-field">
              <span>Email</span>
              <input readOnly value={email} className="is-readonly" />
            </label>
            <label className="profile-field">
              <span>Phone number</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="How can we reach you?"
              />
            </label>
            <label className="profile-field">
              <span>Location</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City or country you work from"
              />
            </label>
            <label className="profile-field">
              <span>Date of birth</span>
              <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
              {derivedAge != null ? (
                <small>Age (derived): {derivedAge}</small>
              ) : (
                <small>Optional — used for birthday reminders only</small>
              )}
            </label>
            <label className="profile-field profile-field--wide">
              <span>Bio / About</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                placeholder="A short intro — hobbies, fun facts, what you work on…"
              />
            </label>
          </div>

          <div className="profile-form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function SettingsPanel() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast('New passwords do not match', 'error');
      return;
    }
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      toast('Password updated', 'success');
      setTimeout(() => {
        localStorage.clear();
        window.location.href = '/login';
      }, 800);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  return (
    <div className="panel">
      <h2 className="panel-title">Settings</h2>
      <p className="stat-sub">Keep your account secure with a strong password.</p>
      <form onSubmit={onSubmit} className="settings-creative-grid">
        <div className="settings-card">
          <span className="settings-card-icon" aria-hidden="true">
            🔒
          </span>
          <label className="settings-card-field">
            <span>Current password</span>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Enter your current password"
              required
            />
          </label>
        </div>
        <div className="settings-card">
          <span className="settings-card-icon" aria-hidden="true">
            ✨
          </span>
          <label className="settings-card-field">
            <span>New password</span>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="Choose a strong new password"
              required
            />
          </label>
        </div>
        <div className="settings-card">
          <span className="settings-card-icon" aria-hidden="true">
            ✓
          </span>
          <label className="settings-card-field">
            <span>Confirm new password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your new password"
              required
            />
          </label>
        </div>
        <div className="settings-card settings-card--action">
          <button type="submit" className="btn btn-primary">
            Update password
          </button>
          <p className="stat-sub" style={{ margin: '8px 0 0' }}>
            You will be signed out on all devices after updating.
          </p>
        </div>
      </form>
    </div>
  );
}
