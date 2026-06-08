import { useRef } from 'react';
import { ChevronDown, ChevronUp, User } from 'lucide-react';
import { ProfilePhotoImg } from '@/components/ui/ProfilePhotoImg';
import type { OrgPerson } from './types';

type Props = {
  person: OrgPerson;
  x: number;
  y: number;
  width: number;
  height: number;
  circleSize: number;
  isExpandedCard: boolean;
  isRootCard?: boolean;
  isHighlighted: boolean;
  reportCount: number;
  canToggle: boolean;
  isBranchCollapsed: boolean;
  onToggleBranch: () => void;
  onOpenDetails: () => void;
  onOpenReports: () => void;
};

function statusClass(status: OrgPerson['status']) {
  if (status === 'away') return 'is-away';
  if (status === 'offline') return 'is-offline';
  return '';
}

export function OrgNode({
  person,
  x,
  y,
  width,
  height,
  circleSize,
  isExpandedCard,
  isRootCard,
  isHighlighted,
  reportCount,
  canToggle,
  isBranchCollapsed,
  onToggleBranch,
  onOpenDetails,
  onOpenReports,
}: Props) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const iconSize = Math.round(circleSize * 0.42);
  const designation = person.title?.trim() || '—';

  return (
    <div
      ref={nodeRef}
      data-org-id={person.id}
      className={`org-node${isHighlighted ? ' is-highlight' : ''}${canToggle ? ' can-toggle' : ''}${isExpandedCard ? ' is-expanded-card' : ''}${isRootCard ? ' is-root-card' : ''}`}
      style={{ left: x - width / 2, top: y, width, height }}
    >
      <div className="org-node__row">
        <div
          className="org-node__circle"
          style={{ width: circleSize, height: circleSize, flexShrink: 0 }}
          onClick={(e) => {
            e.stopPropagation();
            if (canToggle) onToggleBranch();
          }}
          onKeyDown={(e) => {
            if (!canToggle) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onToggleBranch();
            }
          }}
          role={canToggle ? 'button' : undefined}
          tabIndex={canToggle ? 0 : undefined}
          aria-label={
            canToggle
              ? `${isBranchCollapsed ? 'Expand' : 'Collapse'} team for ${person.name}`
              : undefined
          }
          aria-expanded={canToggle ? !isBranchCollapsed : undefined}
        >
          <div
            className="org-node__avatar"
            style={{ width: circleSize - 10, height: circleSize - 10 }}
          >
            <ProfilePhotoImg
              key={`${person.id}-${person.employeeId ?? 'x'}-${person.photo ?? ''}`}
              src={person.photo}
              employeeId={person.employeeId}
              className="org-node__avatar-img"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fallback={<User size={iconSize} strokeWidth={1.5} />}
            />
          </div>
          <span className={`org-node__status ${statusClass(person.status)}`} title={person.status} />
          {canToggle ? (
            <button
              type="button"
              className="org-node__expand-hint"
              onClick={(e) => {
                e.stopPropagation();
                onToggleBranch();
              }}
              aria-label={isBranchCollapsed ? 'Expand team' : 'Collapse team'}
              aria-expanded={!isBranchCollapsed}
            >
              {isBranchCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </button>
          ) : null}
        </div>

        <div className="org-node__labels">
          <p className="org-node__name">{person.name}</p>
          <p className="org-node__designation">{designation}</p>
        </div>
      </div>

      <div className="org-node__hover-menu" role="menu" aria-label={`Actions for ${person.name}`}>
        <button
          type="button"
          role="menuitem"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetails();
          }}
        >
          Details
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={(e) => {
            e.stopPropagation();
            onOpenReports();
          }}
        >
          Manages {reportCount} AVGCian{reportCount === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}
