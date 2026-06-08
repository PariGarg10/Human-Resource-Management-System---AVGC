import { useState } from 'react';
import type { CoparentNode, OrgPerson, OrgTreeChild } from './types';

function isCoparent(node: OrgTreeChild): node is CoparentNode {
  return (node as CoparentNode).type === 'coparent';
}

type Props = {
  root: OrgPerson;
};

function PersonRow({ person, depth }: { person: OrgPerson; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasKids = person.children.length > 0;

  return (
    <div className="org-mobile__item" style={{ marginLeft: depth * 8 }}>
      <div className="org-mobile__card" onClick={() => hasKids && setOpen((v) => !v)} role="presentation">
        <h3>{person.name}</h3>
        <p>
          {person.title} · {person.level}
        </p>
      </div>
      {open && hasKids ? (
        <div className="org-mobile__children">
          {person.children.map((child) =>
            isCoparent(child) ? (
              <CoparentBlock key={child.id} node={child} depth={depth + 1} />
            ) : (
              <PersonRow key={child.id} person={child} depth={depth + 1} />
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

function CoparentBlock({ node, depth }: { node: CoparentNode; depth: number }) {
  return (
    <div style={{ marginLeft: depth * 8 }}>
      {node.parents.length > 1 ? <div className="org-mobile__label">Joint Reporting</div> : null}
      {node.parents.map((p) => (
        <div key={p.id} className="org-mobile__item">
          <div className="org-mobile__card">
            <h3>{p.name}</h3>
            <p>
              {p.title} · {p.level}
            </p>
          </div>
        </div>
      ))}
      <div className="org-mobile__children">
        {node.children.map((child) => (
          <PersonRow key={child.id} person={child} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}

export function MobileOrgList({ root }: Props) {
  return (
    <div className="org-mobile">
      <PersonRow person={root} depth={0} />
    </div>
  );
}
