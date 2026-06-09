import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { clearProfilePhotoCache } from '@/lib/profilePhotoCache';
import type { OrgDirectoryResponse } from '@/features/team-hub/orgDirectory';
import { DEFAULT_ORG_DATA } from './defaultOrgData';
import { flattenDirectory, type DirectoryPerson } from './syncOrgProfiles';
import type { OrgTreeRoot } from './types';

type OrgTreeResponse = { tree: OrgTreeRoot };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function useOrgData() {
  const [data, setData] = useState<OrgTreeRoot | null>(null);
  const [directory, setDirectory] = useState<DirectoryPerson[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshOrg = useCallback(async (bustPhotoCache = false) => {
    if (bustPhotoCache) clearProfilePhotoCache();
    let treeRes: OrgTreeResponse;
    try {
      treeRes = await api<OrgTreeResponse>('/api/users/org-tree');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      throw new Error(msg || 'Could not load organization chart');
    }
    let directory: DirectoryPerson[] = [];
    try {
      const directoryRes = await api<OrgDirectoryResponse>('/api/users/org-directory');
      directory = flattenDirectory(directoryRes);
    } catch {
      /* Chart still works without directory enrichment */
    }
    setData(treeRes.tree);
    setDirectory(directory);
    setLoadError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await refreshOrg(false);
      } catch (err) {
        if (!cancelled) {
          setData(clone(DEFAULT_ORG_DATA));
          const detail = err instanceof Error ? err.message : '';
          setLoadError(
            detail
              ? `Could not load live org data (${detail}). Showing saved preview.`
              : 'Could not load live org data. Showing saved preview.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshOrg]);

  useEffect(() => {
    const onFocus = () => {
      void refreshOrg(true).catch(() => undefined);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshOrg]);

  const reset = useCallback(() => {
    setHighlightId(null);
    void refreshOrg(true);
  }, [refreshOrg]);

  return {
    data,
    directory,
    highlightId,
    loading,
    loadError,
    reset,
    refreshOrg,
  };
}
