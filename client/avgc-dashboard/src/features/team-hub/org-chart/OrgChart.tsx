import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getPersonDisplayPhoto,
  getPersonDisplayTitle,
  getPersonEmployeeId,
} from './syncOrgProfiles';
import { OrgChartIntro } from './OrgChartIntro';
import { computeLayout } from './layoutTree';
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
import { useOrgRole } from './useOrgRole';
import './org-chart.css';

type PanelState = { personId: string; mode: 'details' | 'reports' } | null;
type Phase = 'intro' | 'chart';

export function OrgChart() {
  const { isAdmin } = useOrgRole();
  const { data, directory, highlightId, loading, reset } = useOrgData();
  const [phase, setPhase] = useState<Phase>('chart');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [panel, setPanel] = useState<PanelState>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [transform, setTransform] = useState({ x: 40, y: 20, scale: 1 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => computeLayout(data, collapsed), [data, collapsed]);

  const fitToScreen = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const pad = 56;
    const sx = (vp.clientWidth - pad * 2) / layout.width;
    const sy = (vp.clientHeight - pad * 2) / layout.height;
    const raw = Math.min(sx, sy);
    const scale = raw < 1 ? Math.max(0.38, raw) : Math.min(1.35, raw);
    const x = (vp.clientWidth - layout.width * scale) / 2;
    const y = (vp.clientHeight - layout.height * scale) / 2;
    setTransform({ x, y, scale });
  }, [layout.width, layout.height]);

  useEffect(() => {
    if (phase !== 'chart') return;
    fitToScreen();
  }, [fitToScreen, data, collapsed, panel, phase, layout.width, layout.height]);

  useEffect(() => {
    if (!highlightId || !worldRef.current || !viewportRef.current) return;
    const el = worldRef.current.querySelector(`[data-org-id="${highlightId}"]`);
    if (!el || !(el instanceof HTMLElement)) return;
    const vp = viewportRef.current.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2 - vp.left;
    const cy = rect.top + rect.height / 2 - vp.top;
    setTransform((t) => ({
      ...t,
      x: t.x + (vp.width / 2 - cx),
      y: t.y + (vp.height / 2 - cy),
    }));
  }, [highlightId, layout]);

  const toggleBranch = useCallback(
    (personId: string) => {
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

          {isAdmin ? (
            <button type="button" className="org-chart__reset" onClick={handleRefresh} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh chart'}
            </button>
          ) : null}

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
                const resolvedTitle = getPersonDisplayTitle(person, directory);
                const resolvedEmployeeId = getPersonEmployeeId(person, directory);
                const displayPerson = {
                  ...person,
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
                    isHighlighted={highlightId === ln.id}
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
