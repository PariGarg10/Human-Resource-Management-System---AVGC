import type { LayoutEdge } from './types';

/** Straight segment (orthogonal trunk / branch lines). */
function linePath(from: { x: number; y: number }, to: { x: number; y: number }) {
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

/** Parent → child when not on the same x: down, across, down. */
function trunkBranchPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  if (Math.abs(from.x - to.x) < 2) {
    return linePath(from, to);
  }
  const midY = from.y + (to.y - from.y) * 0.5;
  return `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
}

function pathForEdge(edge: LayoutEdge) {
  if (edge.kind === 'bus-segment') return linePath(edge.from, edge.to);
  if (edge.kind === 'coparent-bar') return linePath(edge.from, edge.to);
  return trunkBranchPath(edge.from, edge.to);
}

type Props = {
  edges: LayoutEdge[];
  width: number;
  height: number;
};

export function OrgConnectors({ edges, width, height }: Props) {
  return (
    <svg className="org-connectors" width={width} height={height} aria-hidden>
      {edges.map((edge) => (
        <path key={edge.id} d={pathForEdge(edge)} />
      ))}
    </svg>
  );
}
