import type { EmployeeUser, UserProfile } from '@/types/employee';
import { writeUserProfileSnapshot } from '@/lib/userProfileStorage';

export class ApiError extends Error {
  requiresPasswordChange?: boolean;
  onboardingRequired?: boolean;
  constructor(
    message: string,
    options?: { requiresPasswordChange?: boolean; onboardingRequired?: boolean }
  ) {
    super(message);
    this.requiresPasswordChange = options?.requiresPasswordChange;
    this.onboardingRequired = options?.onboardingRequired;
  }
}

export function logout() {
  localStorage.clear();
  window.location.href = '/login';
}

export async function api<T>(path: string, options: RequestInit = {}, withAuth = true): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (withAuth) {
    const token = localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let response: Response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error(
      'Cannot reach the server. Start the app with npm run dev and open http://localhost:3000'
    );
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (response.status === 401) {
    logout();
    throw new ApiError('Unauthorized');
  }
  if (response.status === 403 && data.requiresPasswordChange) {
    throw new ApiError(String(data.message || 'Password change required'), {
      requiresPasswordChange: true,
    });
  }
  if (response.status === 403 && data.onboardingRequired) {
    throw new ApiError(String(data.message || 'Complete onboarding first'), {
      onboardingRequired: true,
    });
  }
  if (!response.ok) {
    const fallback =
      response.status === 404
        ? 'API not found — restart the server (npm run dev) and hard-refresh the page'
        : 'Request failed';
    throw new ApiError(String(data.message || fallback));
  }
  return data as T;
}

export function readEmployee(): EmployeeUser | null {
  try {
    const raw = localStorage.getItem('employee');
    if (!raw) return null;
    return JSON.parse(raw) as EmployeeUser;
  } catch {
    return null;
  }
}

export async function apiPatchProfile(formData: FormData) {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/users/me', {
    method: 'PATCH',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.status === 401) {
    logout();
    throw new ApiError('Unauthorized');
  }
  if (response.status === 403 && data.requiresPasswordChange) {
    throw new ApiError(String(data.message || 'Password change required'), {
      requiresPasswordChange: true,
    });
  }
  if (response.status === 403 && data.onboardingRequired) {
    throw new ApiError(String(data.message || 'Complete onboarding first'), {
      onboardingRequired: true,
    });
  }
  if (!response.ok) {
    throw new ApiError(String(data.message || 'Request failed'));
  }
  return data as { profile: UserProfile; message?: string };
}

export function persistEmployeePatch(profile: UserProfile) {
  const prev = readEmployee() || {};
  const next: EmployeeUser = {
    ...prev,
    id: profile.id,
    name: profile.name,
    email: profile.email,
    department: profile.department ?? prev.department,
    employeecode: profile.employeecode ?? prev.employeecode,
    role: profile.role ?? prev.role,
    dateOfBirth: profile.dateOfBirth,
    phone: profile.phone,
    location: profile.location,
    bio: profile.bio,
    profilePhotoUrl: profile.profilePhotoUrl,
    age: profile.age,
    isFirstLogin: profile.isFirstLogin ?? prev.isFirstLogin,
    onboardingCompleted: profile.onboardingCompleted ?? prev.onboardingCompleted,
  };
  if (profile.profilePhotoUrl) {
    next.avatar_url = profile.profilePhotoUrl;
  }
  localStorage.setItem('employee', JSON.stringify(next));
  writeUserProfileSnapshot({ name: profile.name, profilePhotoUrl: profile.profilePhotoUrl ?? null });
  return next;
}
