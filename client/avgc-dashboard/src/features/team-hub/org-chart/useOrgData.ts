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
  const [data, setData] = useState<OrgTreeRoot>(() => clone(DEFAULT_ORG_DATA));
  const [directory, setDirectory] = useState<DirectoryPerson[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshOrg = useCallback(async (bustPhotoCache = false) => {
    if (bustPhotoCache) clearProfilePhotoCache();
    const [treeRes, directoryRes] = await Promise.all([
      api<OrgTreeResponse>('/api/users/org-tree'),
      api<OrgDirectoryResponse>('/api/users/org-directory'),
    ]);
    setData(treeRes.tree);
    setDirectory(flattenDirectory(directoryRes));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await refreshOrg(false);
      } catch {
        if (!cancelled) setData(clone(DEFAULT_ORG_DATA));
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
    reset,
    refreshOrg,
  };
}
