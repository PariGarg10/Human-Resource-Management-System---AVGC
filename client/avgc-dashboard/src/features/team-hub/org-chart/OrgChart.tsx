import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getPersonDisplayDepartment,
  getPersonDisplayName,
  getPersonDisplayPhoto,
  getPersonDisplayTitle,
  getPersonEmployeeId,
} from './syncOrgProfiles';
import { OrgChartIntro } from './OrgChartIntro';
import { computeContentBounds, computeLayout } from './layoutTree';
import { MobileOrgList } from './MobileOrgList';
import { OrgConnectors } from './OrgConnectors';
import { OrgNode } from './OrgNode';
import { OrgSidePanel } from './OrgSidePanel';
import {
  getDirectReports,
  getPersonById,
  getToggleBranchId,
  personHasToggle,
} from './orgUtils';
import { useOrgData } from './useOrgData';
import { useOrgRole, type OrgViewMode } from './useOrgRole';
import './org-chart.css';

type PanelState = { personId: string; mode: 'details' | 'reports' } | null;
type Phase = 'intro' | 'chart';

function resolveNodeFocusRole(
  personId: string,
  employeeId: number | null | undefined,
  focusMeta: { selfId: string | null; managerId: string | null }
): 'self' | 'manager' | null {
  const id = String(personId);
  const empId = employeeId != null ? String(employeeId) : null;
  if (focusMeta.selfId && (id === focusMeta.selfId || empId === focusMeta.selfId)) {
    return 'self';
  }
  if (focusMeta.managerId && (id === focusMeta.managerId || empId === focusMeta.managerId)) {
    return 'manager';
  }
  return null;
}

export function OrgChart() {
  const { isAdmin, canToggleFullView, ready: roleReady } = useOrgRole();
  const [viewMode, setViewMode] = useState<OrgViewMode>('focused');
  const showFullTree = isAdmin || (canToggleFullView && viewMode === 'full');
  const showFocusLabels = !showFullTree;
  const { data, directory, highlightId, focusMeta, loading, loadError, reset } = useOrgData(viewMode);
  const [phase, setPhase] = useState<Phase>('chart');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [panel, setPanel] = useState<PanelState>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(
    () => (data ? computeLayout(data, collapsed) : { width: 0, height: 0, nodes: [], edges: [] }),
    [data, collapsed]
  );

  const fitToScreen = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || vp.clientWidth < 1 || vp.clientHeight < 1) return;

    const pad = 48;
    const bounds = computeContentBounds(layout.nodes);
    const contentW = bounds?.width ?? layout.width;
    const contentH = bounds?.height ?? layout.height;
    const minX = bounds?.minX ?? 0;
    const minY = bounds?.minY ?? 0;

    if (contentW <= 0 || contentH <= 0) return;

    const sx = (vp.clientWidth - pad * 2) / contentW;
    const sy = (vp.clientHeight - pad * 2) / contentH;
    const raw = Math.min(sx, sy);
    const scale = raw < 1 ? Math.max(0.38, raw) : Math.min(1.35, raw);
    const x = (vp.clientWidth - contentW * scale) / 2 - minX * scale;
    const y = (vp.clientHeight - contentH * scale) / 2 - minY * scale;

    setTransform({ x, y, scale });
  }, [layout.nodes, layout.width, layout.height]);

  useEffect(() => {
    if (phase !== 'chart') return;
    fitToScreen();
  }, [fitToScreen, data, collapsed, panel, phase, layout.width, layout.height, viewMode]);

  useEffect(() => {
    if (phase !== 'chart') return;
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      fitToScreen();
    });
    observer.observe(vp);
    return () => observer.disconnect();
  }, [fitToScreen, phase]);

  const toggleBranch = useCallback(
    (personId: string) => {
      if (!data) return;
      const branchId = getToggleBranchId(data, personId);
      if (!branchId) return;
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(branchId)) next.delete(branchId);
        else next.add(branchId);
        return next;
      });
    },
    [data]
  );

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    window.setTimeout(() => setPanel(null), 300);
  }, []);

  useEffect(() => {
    if (!panel) {
      setPanelOpen(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setPanelOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, [panel?.personId, panel?.mode]);

  const openPanel = useCallback((next: PanelState) => {
    setPanel(next);
  }, []);

  const enterChart = () => {
    setPhase('chart');
    setCollapsed(new Set());
    setPanelOpen(false);
    setPanel(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.org-node')) return;
    setPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!panning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setTransform((t) => ({
      ...t,
      x: panStart.current.tx + dx,
      y: panStart.current.ty + dy,
    }));
  };

  const onPointerUp = () => setPanning(false);

  const handleRefresh = () => {
    if (!isAdmin) return;
    void reset();
  };

  if (!roleReady || loading || !data) {
    return (
      <div className="org-chart-shell org-chart-shell--loading">
        <p className="org-chart-loading" role="status" aria-live="polite">
          Loading organization chart…
        </p>
      </div>
    );
  }

  const panelPerson = panel ? getPersonById(data, panel.personId) : null;
  const panelReports = panelPerson ? getDirectReports(data, panelPerson.id) : [];
  const personNodes = layout.nodes.filter((n) => n.kind === 'person' && n.person);

  if (phase === 'intro') {
    return (
      <>
        <div className="org-chart-shell org-chart-shell--intro">
          <OrgChartIntro onEnter={enterChart} />
        </div>
        <MobileOrgList root={data} />
      </>
    );
  }

  return (
    <>
      <div className={`org-chart-shell${panel ? ' has-panel' : ''}${panelOpen ? ' is-panel-open' : ''}`}>
        {panel ? (
          <button
            type="button"
            className="org-chart-backdrop"
            aria-label="Close employee details"
            onClick={closePanel}
          />
        ) : null}

        <div className="org-chart org-chart--tree">
          <div className="org-chart__dots" />
          <div className="org-chart__stars" />

          {loadError ? <p className="org-chart-load-error">{loadError}</p> : null}

          <div className="org-chart__toolbar">
            {canToggleFullView ? (
              <button
                type="button"
                className="org-chart__view-toggle"
                onClick={() => setViewMode((mode) => (mode === 'focused' ? 'full' : 'focused'))}
                disabled={loading}
                aria-pressed={viewMode === 'full'}
              >
                {viewMode === 'focused' ? 'Full Org Chart' : 'My View'}
              </button>
            ) : null}
            {isAdmin ? (
              <button type="button" className="org-chart__reset" onClick={handleRefresh} disabled={loading}>
                {loading ? 'Loading…' : 'Refresh chart'}
              </button>
            ) : null}
          </div>

          <div
            ref={viewportRef}
            className={`org-chart__viewport${panning ? ' is-panning' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <div
              ref={worldRef}
              className="org-chart__world org-chart__world--animate"
              style={{
                width: layout.width,
                height: layout.height,
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              }}
            >
              <OrgConnectors edges={layout.edges} width={layout.width} height={layout.height} />
              {personNodes.map((ln) => {
                const person = ln.person!;
                const resolvedPhoto = getPersonDisplayPhoto(person, directory);
                const resolvedName = getPersonDisplayName(person, directory);
                const resolvedTitle = getPersonDisplayTitle(person, directory);
                const resolvedDepartment = getPersonDisplayDepartment(person, directory);
                const resolvedEmployeeId = getPersonEmployeeId(person, directory);
                const focusRole = showFocusLabels
                  ? resolveNodeFocusRole(person.id, resolvedEmployeeId, focusMeta)
                  : null;
                const displayPerson = {
                  ...person,
                  name: resolvedName,
                  photo: resolvedPhoto,
                  title: resolvedTitle,
                  employeeId: resolvedEmployeeId,
                };
                const branchId = getToggleBranchId(data, person.id);
                const reportCount = getDirectReports(data, person.id).length;
                return (
                  <OrgNode
                    key={`${ln.id}-${resolvedEmployeeId ?? 'x'}-${resolvedPhoto ?? ''}`}
                    person={displayPerson}
                    x={ln.x}
                    y={ln.y}
                    width={ln.width}
                    height={ln.height}
                    circleSize={ln.circleSize}
                    isExpandedCard={ln.isExpandedCard}
                    isRootCard={ln.isRootCard}
                    isHighlighted={!showFullTree && (highlightId === ln.id || focusRole === 'self')}
                    focusRole={focusRole}
                    department={resolvedDepartment}
                    reportCount={reportCount}
                    canToggle={personHasToggle(data, person.id)}
                    isBranchCollapsed={branchId ? collapsed.has(branchId) : false}
                    onToggleBranch={() => toggleBranch(person.id)}
                    onOpenDetails={() => openPanel({ personId: person.id, mode: 'details' })}
                    onOpenReports={() => openPanel({ personId: person.id, mode: 'reports' })}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {panel && panelPerson ? (
          <OrgSidePanel
            open={panelOpen}
            mode={panel.mode}
            root={data}
            person={panelPerson}
            reports={panelReports}
            directory={directory}
            isAdmin={false}
            canRemove={false}
            onClose={closePanel}
            onSelectPerson={(id) => openPanel({ personId: id, mode: 'details' })}
            onAddMember={() => undefined}
            onEditPerson={() => undefined}
            onRemovePerson={() => undefined}
          />
        ) : null}
      </div>

      <MobileOrgList root={data} />
    </>
  );
}
