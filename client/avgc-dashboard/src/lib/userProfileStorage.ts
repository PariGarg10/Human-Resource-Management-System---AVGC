import type { UserProfile } from '@/types/employee';

export function writeUserProfileSnapshot(profile: Pick<UserProfile, 'name' | 'profilePhotoUrl'>) {
  try {
    localStorage.setItem(
      'user_profile',
      JSON.stringify({
        name: profile.name || '',
        profilePhotoUrl: profile.profilePhotoUrl || null,
      })
    );
  } catch {
    /* ignore */
  }
}
