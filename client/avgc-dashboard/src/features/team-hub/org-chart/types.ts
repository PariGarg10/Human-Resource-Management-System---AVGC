export type OrgLevel = 'root' | 'c-suite' | 'director' | 'manager' | 'lead' | 'intern';
export type OrgStatus = 'online' | 'away' | 'offline';

export interface OrgPerson {
  id: string;
  name: string;
  title: string;
  level: OrgLevel;
  photo: string | null;
  /** Linked HRMS employee id — used to sync profile photo and name from the portal. */
  employeeId?: number | null;
  status: OrgStatus;
  skills: string[];
  tags: string[];
  children: OrgTreeChild[];
}

export interface CoparentNode {
  id: string;
  type: 'coparent';
  parents: Omit<OrgPerson, 'children'>[];
  children: OrgPerson[];
}

export type OrgTreeChild = OrgPerson | CoparentNode;

export interface OrgTreeRoot extends OrgPerson {}

export type LayoutEdgeKind = 'parent-child' | 'coparent-bar' | 'bus-segment';

export interface LayoutEdge {
  id: string;
  kind: LayoutEdgeKind;
  from: { x: number; y: number };
  to: { x: number; y: number };
  mid?: { x: number; y: number };
}

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  circleSize: number;
  isExpandedCard: boolean;
  isRootCard?: boolean;
  kind: 'person' | 'coparent';
  person?: OrgPerson;
  coparent?: CoparentNode;
  parentId?: string;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export type NewEmployeeInput = {
  name: string;
  title: string;
  level: OrgLevel;
  photo: string | null;
  employeeId?: number | null;
  status: OrgStatus;
  skills: string[];
  tags: string[];
};

export type UpdateEmployeeInput = {
  name: string;
  title: string;
  level: OrgLevel;
  photo: string | null;
  employeeId?: number | null;
  status: OrgStatus;
  skills: string[];
  tags: string[];
};
