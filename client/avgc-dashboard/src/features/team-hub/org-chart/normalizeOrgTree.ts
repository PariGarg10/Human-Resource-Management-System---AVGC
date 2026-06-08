import type { CoparentNode, OrgPerson, OrgTreeChild, OrgTreeRoot } from './types';

function isCoparent(node: OrgTreeChild): node is CoparentNode {
  return (node as CoparentNode).type === 'coparent';
}

const ABC_PARENT: Omit<OrgPerson, 'children'> = {
  id: '2b',
  name: 'ABC',
  title: 'Director',
  level: 'director',
  photo: null,
  status: 'online',
  skills: [],
  tags: [],
};

function restoreCoparentBesideXyz(children: OrgTreeChild[]): OrgTreeChild[] {
  if (children.length !== 1 || isCoparent(children[0])) return children;

  const only = children[0] as OrgPerson;
  if (only.id !== '2a' && String(only.name || '').trim().toLowerCase() !== 'xyz') {
    return children;
  }

  const coparent: CoparentNode = {
    id: '2',
    type: 'coparent',
    parents: [
      {
        id: only.id,
        name: only.name,
        title: only.title,
        level: only.level,
        photo: only.photo ?? null,
        employeeId: only.employeeId ?? null,
        status: only.status,
        skills: only.skills ?? [],
        tags: only.tags ?? [],
      },
      { ...ABC_PARENT },
    ],
    children: (only.children ?? []) as OrgPerson[],
  };

  return [coparent];
}

function normalizeChildList(children: OrgTreeChild[]): OrgTreeChild[] {
  const out: OrgTreeChild[] = [];

  for (const child of children) {
    if (isCoparent(child)) {
      const parents = child.parents.length ? [...child.parents] : [];
      const hasAbc = parents.some((p) => p.id === '2b' || p.name === 'ABC');
      const nextParents = hasAbc ? parents : [...parents, { ...ABC_PARENT }];
      const nestedChildren = normalizeChildList(child.children);

      out.push({ ...child, parents: nextParents, children: nestedChildren as OrgPerson[] });
      continue;
    }

    const person = child as OrgPerson;
    out.push({
      ...person,
      children: normalizeChildList(person.children),
    });
  }

  return out;
}

/** Keep XYZ + ABC coparent layout; restore ABC if a prior migration removed it. */
export function normalizeOrgTree(root: OrgTreeRoot): OrgTreeRoot {
  const restoredRootChildren = restoreCoparentBesideXyz(root.children);
  return {
    ...root,
    children: normalizeChildList(restoredRootChildren),
  };
}
