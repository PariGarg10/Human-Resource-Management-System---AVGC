const cache = new Map<string, string>();

export function getCachedProfilePhoto(path: string): string | null {
  return cache.get(path) ?? null;
}

export function setCachedProfilePhoto(path: string, objectUrl: string) {
  cache.set(path, objectUrl);
}

export function clearProfilePhotoCache() {
  for (const objectUrl of cache.values()) {
    if (objectUrl.startsWith('blob:')) {
      URL.revokeObjectURL(objectUrl);
    }
  }
  cache.clear();
}
