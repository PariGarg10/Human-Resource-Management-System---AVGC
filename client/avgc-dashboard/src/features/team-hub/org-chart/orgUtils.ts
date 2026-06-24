import type { CoparentNode, OrgPerson, OrgTreeChild, OrgTreeRoot } from './types';

function isCoparent(node: OrgTreeChild): node is CoparentNode {
  return (node as CoparentNode).type === 'coparent';
}

export function getPersonById(root: OrgTreeRoot, id: string): OrgPerson | null {
  if (root.id === id) return root;

  function walk(node: OrgPerson): OrgPerson | null {
    for (const child of node.children) {
      if (isCoparent(child)) {
        for (const parent of child.parents) {
          if (parent.id === id) {
            return { ...parent, children: [] };
          }
        }
        for (const sub of child.children) {
          if (sub.id === id) return sub;
          const found = walk(sub);
          if (found) return found;
        }
      } else {
        if (child.id === id) return child;
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  }

  return walk(root);
}

export function getDirectReports(root: OrgTreeRoot, personId: string): OrgPerson[] {
  if (root.id === personId) {
    return flattenChildren(root.children);
  }

  function walk(node: OrgPerson): OrgPerson[] | null {
    if (node.id === personId) {
      return flattenChildren(node.children);
    }
    for (const child of node.children) {
      if (isCoparent(child)) {
        if (child.parents.some((p) => p.id === personId)) {
          return child.children;
        }
        if (child.id === personId) {
          return child.children;
        }
        for (const sub of child.children) {
          const found = walk(sub);
          if (found) return found;
        }
      } else {
        if (child.id === personId) {
          return flattenChildren(child.children);
        }
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  }

  return walk(root) ?? [];
}

function flattenChildren(children: OrgTreeChild[]): OrgPerson[] {
  const out: OrgPerson[] = [];
  for (const child of children) {
    if (isCoparent(child)) {
      child.parents.forEach((p) => out.push({ ...p, children: [] }));
    } else {
      out.push(child);
    }
  }
  return out;
}

export function allBranchIds(root: OrgTreeRoot): Set<string> {
  const ids = new Set<string>();

  function visit(node: OrgPerson) {
    if (node.children.length > 0) ids.add(node.id);
    for (const child of node.children) {
      if (isCoparent(child)) {
        if (child.children.length > 0) ids.add(child.id);
        child.children.forEach(visit);
      } else {
        visit(child);
      }
    }
  }

  visit(root);
  return ids;
}

/** Default admin org chart: show root through N management levels; collapse deeper branches. */
export function computeCollapsedThroughManagementLevel(
  root: OrgTreeRoot,
  managementLevels: number
): Set<string> {
  const collapsed = new Set<string>();
  if (managementLevels < 1) return collapsed;

  const maxVisibleDepth = managementLevels - 1;

  function walkPerson(node: OrgPerson, depth: number) {
    if (node.children.length === 0) return;
    if (depth >= maxVisibleDepth) {
      collapsed.add(node.id);
    }
    for (const child of node.children) {
      if (isCoparent(child)) {
        walkCoparent(child, depth + 1);
      } else {
        walkPerson(child, depth + 1);
      }
    }
  }

  function walkCoparent(node: CoparentNode, depth: number) {
    if (node.children.length === 0) return;
    if (depth >= maxVisibleDepth) {
      collapsed.add(node.id);
    }
    for (const child of node.children) {
      walkPerson(child, depth + 1);
    }
  }

  walkPerson(root, 0);
  return collapsed;
}

/** Branch id used for expand/collapse when clicking a visible card. */
export function getToggleBranchId(root: OrgTreeRoot, personId: string): string | null {
  if (root.id === personId && root.children.length > 0) return root.id;

  function walk(node: OrgPerson): string | null {
    if (node.id === personId) {
      return node.children.length > 0 ? node.id : null;
    }
    for (const child of node.children) {
      if (isCoparent(child)) {
        if (child.parents.some((p) => p.id === personId)) {
          return child.children.length > 0 ? child.id : null;
        }
        if (child.id === personId && child.children.length > 0) return child.id;
        for (const sub of child.children) {
          const found = walk(sub);
          if (found) return found;
        }
      } else {
        if (child.id === personId) {
          return child.children.length > 0 ? child.id : null;
        }
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  }

  return walk(root);
}

export function personHasToggle(root: OrgTreeRoot, personId: string): boolean {
  return getToggleBranchId(root, personId) !== null;
}

export function personSummary(person: OrgPerson): string {
  const skills = person.skills.length ? person.skills.join(', ') : 'cross-functional collaboration';
  return `${person.name} serves as ${person.title} at AVGC Studios, contributing through ${skills} and supporting team goals across the organization.`;
}

export type ReportingChainLink = Pick<OrgPerson, 'id' | 'name' | 'title'>;

function toChainLink(person: Pick<OrgPerson, 'id' | 'name' | 'title'>): ReportingChainLink {
  return { id: person.id, name: person.name, title: person.title };
}

/** Path from org root down to the selected person (includes coparent leaders when applicable). */
export function getReportingChain(root: OrgTreeRoot, personId: string): ReportingChainLink[] {
  if (root.id === personId) {
    return [toChainLink(root)];
  }

  function walk(node: OrgPerson, ancestors: ReportingChainLink[]): ReportingChainLink[] | null {
    for (const child of node.children) {
      if (isCoparent(child)) {
        const parentHit = child.parents.find((p) => p.id === personId);
        if (parentHit) {
          return [...ancestors, toChainLink(node), toChainLink(parentHit)];
        }

        const viaCoparent: ReportingChainLink[] = [
          ...ancestors,
          toChainLink(node),
          ...child.parents.map(toChainLink),
        ];

        for (const sub of child.children) {
          if (sub.id === personId) {
            return [...viaCoparent, toChainLink(sub)];
          }
          const found = walk(sub, viaCoparent);
          if (found) return found;
        }
      } else {
        if (child.id === personId) {
          return [...ancestors, toChainLink(node), toChainLink(child)];
        }
        const found = walk(child, [...ancestors, toChainLink(node)]);
        if (found) return found;
      }
    }
    return null;
  }

  return walk(root, []) ?? [toChainLink(root)];
}
