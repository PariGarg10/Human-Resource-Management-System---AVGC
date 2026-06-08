import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { getCachedProfilePhoto, setCachedProfilePhoto } from '@/lib/profilePhotoCache';

function needsAuthenticatedFetch(src: string | null | undefined): boolean {
  if (!src) return false;
  return src.startsWith('/api/users/profile-photo');
}

function isDirectPhotoUrl(src: string): boolean {
  return (
    src.startsWith('/uploads/') ||
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('blob:') ||
    src.startsWith('data:image/')
  );
}

type Props = {
  src?: string | null;
  employeeId?: number | null;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  fallback: ReactNode;
};

export function ProfilePhotoImg({ src, alt = '', className, style, fallback }: Props) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    let cancelled = false;

    async function load() {
      if (!src) {
        setResolvedSrc(null);
        return;
      }

      const direct = isDirectPhotoUrl(src) && !needsAuthenticatedFetch(src) ? src : null;
      if (direct) {
        setResolvedSrc(direct);
        return;
      }

      if (!needsAuthenticatedFetch(src) || src.endsWith('/me')) {
        setResolvedSrc(null);
        return;
      }

      const path = src;
      const cached = getCachedProfilePhoto(path);
      if (cached) {
        setResolvedSrc(cached);
        return;
      }

      try {
        const token = localStorage.getItem('token');
        const res = await fetch(path, {
          credentials: 'same-origin',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          if (!cancelled) setResolvedSrc(null);
          return;
        }

        const contentType = (res.headers.get('Content-Type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
          if (!cancelled) setResolvedSrc(null);
          return;
        }

        const blob = await res.blob();
        if (!blob.size) {
          if (!cancelled) setResolvedSrc(null);
          return;
        }

        const blobType = (blob.type || contentType).toLowerCase();
        if (blobType && !blobType.startsWith('image/') && blobType !== 'application/octet-stream') {
          if (!cancelled) setResolvedSrc(null);
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        setCachedProfilePhoto(path, objectUrl);
        if (!cancelled) setResolvedSrc(objectUrl);
      } catch {
        if (!cancelled) setResolvedSrc(null);
      }
    }

    load().catch(() => {
      if (!cancelled) setResolvedSrc(null);
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!resolvedSrc || failed) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
