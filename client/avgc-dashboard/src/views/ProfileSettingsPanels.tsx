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
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Loading profile…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{name.trim() || 'My profile'}</h2>
      <p className="mt-1 text-sm text-slate-500">
        Update your details. Email is managed by your administrator and cannot be changed here.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Employee Name</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{name || '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Designation</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{designation || '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Department</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{department || '—'}</p>
        </div>
      </div>
      {saveOk && (
        <div
          className="mt-4 rounded-md border border-[#ed1d24]/30 bg-[rgba(237,29,36,0.08)] px-4 py-3 text-sm font-semibold text-[#ed1d24]"
          role="status"
        >
          Profile saved successfully. Your name and photo are updated across the app.
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 max-w-2xl space-y-5">
        <div className="flex flex-wrap items-start gap-6">
          <div className="shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Photo</p>
            <div className="mt-2 flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {previewUrl ? (
                <img src={previewUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-slate-400">
                  {(name || email || '?').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <label className="mt-2 block text-sm font-medium text-avgc-brand">
              <span className="cursor-pointer hover:underline">Upload image</span>
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

          <div className="min-w-0 flex-1 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Full name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm min-h-[44px]"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input
                readOnly
                value={email}
                className="mt-1 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-600 min-h-[44px]"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Phone number
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm min-h-[44px]"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Location (city / country)
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Bengaluru, India"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm min-h-[44px]"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Date of Birth
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm min-h-[44px]"
              />
              <span className="mt-1 block text-xs text-slate-500">Optional. Used for birthday reminders only.</span>
              {derivedAge != null && (
                <span className="mt-1 block text-xs font-medium text-slate-600">Age (derived): {derivedAge}</span>
              )}
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Bio / About
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                placeholder="Short introduction…"
              />
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-avgc-brand px-6 py-3 text-sm font-semibold text-white disabled:opacity-60 min-h-[44px]"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  );
}

export function SettingsPanel() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Security</h2>
      <form onSubmit={onSubmit} className="mt-6 grid max-w-xl gap-4">
        <label className="text-sm font-medium text-slate-700">
          Current password
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm min-h-[44px]"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          New password
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm min-h-[44px]"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-avgc-brand px-6 py-3 text-sm font-semibold text-white min-h-[44px] w-fit"
        >
          Update password
        </button>
      </form>
    </div>
  );
}
