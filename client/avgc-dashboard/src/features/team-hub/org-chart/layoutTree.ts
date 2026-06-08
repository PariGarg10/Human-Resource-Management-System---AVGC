import type { CoparentNode, LayoutEdge, LayoutNode, LayoutResult, OrgPerson, OrgTreeChild } from './types';

/** Horizontal card: circle left, name + designation right */
export const NODE_W = 210;
export const NODE_H = 76;
export const CIRCLE_SIZE = 68;
export const NODE_W_EXPANDED = 232;
export const NODE_H_EXPANDED = 84;
export const CIRCLE_SIZE_EXPANDED = 76;
export const NODE_W_ROOT = 228;
export const NODE_H_ROOT = 88;
export const CIRCLE_SIZE_ROOT = 80;
export const H_GAP = 56;
export const V_GAP = 88;
export const COPARENT_GAP = 40;

type NodeDims = { w: number; h: number; circle: number };

function isCoparent(node: OrgTreeChild): node is CoparentNode {
  return (node as CoparentNode).type === 'coparent';
}

function dimsForExpanded(expanded: boolean, isRoot = false): NodeDims {
  if (isRoot && !expanded) {
    return { w: NODE_W_ROOT, h: NODE_H_ROOT, circle: CIRCLE_SIZE_ROOT };
  }
  return expanded
    ? { w: NODE_W_EXPANDED, h: NODE_H_EXPANDED, circle: CIRCLE_SIZE_EXPANDED }
    : { w: NODE_W, h: NODE_H, circle: CIRCLE_SIZE };
}

function hasVisibleChildren(node: OrgPerson | CoparentNode, collapsed: Set<string>): boolean {
  if (isCoparent(node)) return node.children.length > 0 && !collapsed.has(node.id);
  return node.children.length > 0 && !collapsed.has(node.id);
}

function personBranchExpanded(
  personId: string,
  parentId: string | undefined,
  hasBranch: boolean,
  collapsed: Set<string>
): boolean {
  if (!hasBranch) return false;
  const branchId = parentId ?? personId;
  return !collapsed.has(branchId);
}

function bottomAnchor(x: number, y: number, nodeH: number) {
  return { x, y: y + nodeH };
}

function topAnchor(x: number, y: number) {
  return { x, y };
}

function measureSubtree(node: OrgPerson | CoparentNode, collapsed: Set<string>): number {
  if (isCoparent(node)) {
    const expanded = personBranchExpanded(node.id, undefined, node.children.length > 0, collapsed);
    const dims = dimsForExpanded(expanded);
    const parentsW = node.parents.reduce((sum, _p, i) => sum + dims.w + (i ? COPARENT_GAP : 0), 0);
    if (!hasVisibleChildren(node, collapsed)) return parentsW;
    const kidsW = node.children.reduce(
      (sum, child, i) => sum + measureSubtree(child, collapsed) + (i ? H_GAP : 0),
      0
    );
    return Math.max(parentsW, kidsW);
  }

  const expanded = personBranchExpanded(node.id, undefined, node.children.length > 0, collapsed);
  const w = dimsForExpanded(expanded).w;
  if (!hasVisibleChildren(node, collapsed)) return w;

  const kidsW = node.children.reduce((sum, child, i) => {
    return sum + measureSubtree(child, collapsed) + (i ? H_GAP : 0);
  }, 0);

  return Math.max(w, kidsW);
}

function connectChildrenBus(
  nodeId: string,
  parentBottom: { x: number; y: number },
  childTops: { x: number; y: number }[],
  edges: LayoutEdge[]
) {
  if (!childTops.length) return;

  if (childTops.length === 1) {
    const child = childTops[0];
    edges.push({
      id: `edge-${nodeId}-single`,
      kind: 'parent-child',
      from: parentBottom,
      to: topAnchor(child.x, child.y),
    });
    return;
  }

  const avgChildY = childTops.reduce((sum, c) => sum + c.y, 0) / childTops.length;
  const busY = parentBottom.y + (avgChildY - parentBottom.y) * 0.42;
  const minX = Math.min(...childTops.map((c) => c.x));
  const maxX = Math.max(...childTops.map((c) => c.x));
  const trunkX = parentBottom.x;

  edges.push({
    id: `edge-${nodeId}-trunk`,
    kind: 'bus-segment',
    from: parentBottom,
    to: { x: trunkX, y: busY },
  });

  if (Math.abs(maxX - minX) > 2) {
    edges.push({
      id: `edge-${nodeId}-bus`,
      kind: 'bus-segment',
      from: { x: minX, y: busY },
      to: { x: maxX, y: busY },
    });
  }

  childTops.forEach((child, i) => {
    edges.push({
      id: `edge-${nodeId}-drop-${i}`,
      kind: 'bus-segment',
      from: { x: child.x, y: busY },
      to: topAnchor(child.x, child.y),
    });
  });
}

function layoutCoparent(
  node: CoparentNode,
  centerX: number,
  y: number,
  collapsed: Set<string>,
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  parentAnchor?: { x: number; y: number }
): { bottomY: number; midX: number } {
  const groupExpanded = personBranchExpanded(node.id, undefined, node.children.length > 0, collapsed);
  const groupDims = dimsForExpanded(groupExpanded);

  const parentsW = node.parents.reduce((sum, _p, i) => sum + groupDims.w + (i ? COPARENT_GAP : 0), 0);
  let px = centerX - parentsW / 2;

  const parentBottoms: { x: number; y: number }[] = [];

  node.parents.forEach((parent) => {
    const x = px + groupDims.w / 2;
    nodes.push({
      id: parent.id,
      x,
      y,
      width: groupDims.w,
      height: groupDims.h,
      circleSize: groupDims.circle,
      isExpandedCard: groupExpanded,
      kind: 'person',
      person: { ...parent, children: [] },
      parentId: node.id,
    });
    parentBottoms.push(bottomAnchor(x, y, groupDims.h));
    px += groupDims.w + COPARENT_GAP;
  });

  const midX = centerX;
  const barY = y + groupDims.circle + 12;

  if (parentAnchor) {
    edges.push({
      id: `edge-in-${node.id}`,
      kind: 'parent-child',
      from: parentAnchor,
      to: topAnchor(midX, y),
    });
  }

  nodes.push({
    id: node.id,
    x: midX,
    y: barY - 8,
    width: parentsW,
    height: 0,
    circleSize: 0,
    isExpandedCard: false,
    kind: 'coparent',
    coparent: node,
  });

  let bottomY = barY + 18;

  if (!hasVisibleChildren(node, collapsed)) {
    return { bottomY, midX };
  }

  const kidsY = bottomY + V_GAP - 20;
  const kidsW = node.children.reduce(
    (sum, child, i) => sum + measureSubtree(child, collapsed) + (i ? H_GAP : 0),
    0
  );
  let cx = centerX - kidsW / 2;

  const childTops: { x: number; y: number }[] = [];

  node.children.forEach((child) => {
    const cw = measureSubtree(child, collapsed);
    const childCenter = cx + cw / 2;
    if (isCoparent(child)) {
      const res = layoutCoparent(child, childCenter, kidsY, collapsed, nodes, edges);
      childTops.push({ x: childCenter, y: kidsY });
      bottomY = Math.max(bottomY, res.bottomY);
    } else {
      const res = layoutPerson(child, childCenter, kidsY, collapsed, nodes, edges);
      childTops.push({ x: childCenter, y: kidsY });
      bottomY = Math.max(bottomY, res.bottomY);
    }
    cx += cw + H_GAP;
  });

  connectChildrenBus(node.id, { x: midX, y: barY + 14 }, childTops, edges);

  return { bottomY, midX };
}

function layoutPerson(
  node: OrgPerson,
  centerX: number,
  y: number,
  collapsed: Set<string>,
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  parentAnchor?: { x: number; y: number }
): { bottomY: number } {
  const expanded = personBranchExpanded(node.id, undefined, node.children.length > 0, collapsed);
  const dims = dimsForExpanded(expanded, node.level === 'root');

  nodes.push({
    id: node.id,
    x: centerX,
    y,
    width: dims.w,
    height: dims.h,
    circleSize: dims.circle,
    isExpandedCard: expanded,
    isRootCard: node.level === 'root' && !expanded,
    kind: 'person',
    person: node,
  });

  if (parentAnchor) {
    edges.push({
      id: `edge-${parentAnchor.x}-${node.id}`,
      kind: 'parent-child',
      from: parentAnchor,
      to: topAnchor(centerX, y),
    });
  }

  let bottomY = y + dims.h;

  if (!hasVisibleChildren(node, collapsed)) return { bottomY };

  const kidsY = y + dims.h + V_GAP;
  const kidsW = node.children.reduce((sum, child, i) => {
    return sum + measureSubtree(child, collapsed) + (i ? H_GAP : 0);
  }, 0);

  let cx = centerX - kidsW / 2;
  const anchor = bottomAnchor(centerX, y, dims.h);
  const childTops: { x: number; y: number }[] = [];

  const singleChild = node.children.length === 1;

  node.children.forEach((child) => {
    const cw = measureSubtree(child, collapsed);
    const childCenter = cx + cw / 2;
    const childAnchor = singleChild ? anchor : undefined;
    if (isCoparent(child)) {
      const res = layoutCoparent(child, childCenter, kidsY, collapsed, nodes, edges, childAnchor);
      childTops.push({ x: childCenter, y: kidsY });
      bottomY = Math.max(bottomY, res.bottomY);
    } else {
      const res = layoutPerson(child, childCenter, kidsY, collapsed, nodes, edges, childAnchor);
      childTops.push({ x: childCenter, y: kidsY });
      bottomY = Math.max(bottomY, res.bottomY);
    }
    cx += cw + H_GAP;
  });

  if (!singleChild) {
    connectChildrenBus(node.id, anchor, childTops, edges);
  }

  return { bottomY };
}

export function computeLayout(root: OrgPerson, collapsed: Set<string>): LayoutResult {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const totalW = measureSubtree(root, collapsed);
  const startX = totalW / 2;
  const { bottomY } = layoutPerson(root, startX, 40, collapsed, nodes, edges);

  return {
    nodes,
    edges,
    width: Math.max(totalW + 80, 400),
    height: Math.max(bottomY + 80, 320),
  };
}
