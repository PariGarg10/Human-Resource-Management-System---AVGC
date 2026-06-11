import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { clearProfilePhotoCache } from '@/lib/profilePhotoCache';
import type { OrgDirectoryResponse } from '@/features/team-hub/orgDirectory';
import { DEFAULT_ORG_DATA } from './defaultOrgData';
import { flattenDirectory, type DirectoryPerson } from './syncOrgProfiles';
import type { OrgTreeRoot } from './types';
import { getLoggedInEmployeeId, useOrgRole, type OrgViewMode } from './useOrgRole';

type OrgTreeResponse = { tree: OrgTreeRoot };

type FocusedOrgResponse = {
  manager: { id: number } | null;
  self: { id: number };
  tree: OrgTreeRoot;
};

export type OrgFocusMeta = {
  selfId: string | null;
  managerId: string | null;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deriveFocusMeta(tree: OrgTreeRoot, userId: number): OrgFocusMeta {
  const selfId = String(userId);
  const rootEmployeeId = tree.employeeId ?? Number(tree.id);
  if (!Number.isFinite(rootEmployeeId) || rootEmployeeId === userId) {
    return { selfId, managerId: null };
  }
  return { selfId, managerId: String(rootEmployeeId) };
}

export function useOrgData(viewMode: OrgViewMode = 'focused') {
  const { isAdmin, isManager, userId, ready } = useOrgRole();
  const [data, setData] = useState<OrgTreeRoot | null>(null);
  const [directory, setDirectory] = useState<DirectoryPerson[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [focusMeta, setFocusMeta] = useState<OrgFocusMeta>({ selfId: null, managerId: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const effectiveMode: OrgViewMode = isAdmin ? 'full' : viewMode;

  const refreshOrg = useCallback(
    async (bustPhotoCache = false) => {
      if (bustPhotoCache) clearProfilePhotoCache();

      const employeeId = userId ?? getLoggedInEmployeeId();
      const useFullTree = isAdmin || (isManager && effectiveMode === 'full');

      let tree: OrgTreeRoot;
      let nextFocus: OrgFocusMeta = { selfId: null, managerId: null };

      if (useFullTree) {
        const treeRes = await api<OrgTreeResponse>(
          isAdmin ? '/api/users/org-tree' : '/api/users/org-tree?full=1'
        );
        tree = treeRes.tree;
        if (employeeId != null) {
          nextFocus = deriveFocusMeta(tree, employeeId);
          setHighlightId(String(employeeId));
        }
      } else {
        if (employeeId == null) {
          throw new Error('Could not determine logged-in employee');
        }
        const focused = await api<FocusedOrgResponse>(`/api/org-chart/focused/${employeeId}`);
        tree = focused.tree;
        nextFocus = {
          selfId: String(focused.self.id),
          managerId: focused.manager ? String(focused.manager.id) : null,
        };
        setHighlightId(nextFocus.selfId);
      }

      let nextDirectory: DirectoryPerson[] = [];
      try {
        const directoryRes = await api<OrgDirectoryResponse>('/api/users/org-directory');
        nextDirectory = flattenDirectory(directoryRes);
      } catch {
        /* Chart still works without directory enrichment */
      }

      setData(tree);
      setDirectory(nextDirectory);
      setFocusMeta(nextFocus);
      setLoadError(null);
    },
    [effectiveMode, isAdmin, isManager, userId]
  );

  useEffect(() => {
    if (!ready) return;
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
  }, [ready, refreshOrg]);

  useEffect(() => {
    const onFocus = () => {
      void refreshOrg(true).catch(() => undefined);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'employee') {
        void refreshOrg(true).catch(() => undefined);
      }
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, [refreshOrg]);

  const reset = useCallback(() => {
    void refreshOrg(true);
  }, [refreshOrg]);

  return {
    data,
    directory,
    highlightId,
    focusMeta,
    loading,
    loadError,
    reset,
    refreshOrg,
  };
}
