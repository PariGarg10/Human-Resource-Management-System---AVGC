import { ChevronLeft, Pencil, Trash2, User, UserPlus, X } from 'lucide-react';
import { ProfilePhotoImg } from '@/components/ui/ProfilePhotoImg';
import { getReportingChain, type ReportingChainLink } from './orgUtils';
import {
  getPersonDisplayName,
  getPersonDisplayPhoto,
  getPersonDisplayTitle,
  getPersonEmployeeId,
  getPersonProfileDetails,
  type DirectoryPerson,
} from './syncOrgProfiles';
import type { OrgPerson, OrgTreeRoot } from './types';

type PanelMode = 'details' | 'reports';

type Props = {
  open: boolean;
  mode: PanelMode;
  root: OrgTreeRoot;
  person: OrgPerson;
  reports: OrgPerson[];
  directory: DirectoryPerson[];
  isAdmin: boolean;
  canRemove: boolean;
  onClose: () => void;
  onSelectPerson: (id: string) => void;
  onAddMember: () => void;
  onEditPerson: () => void;
  onRemovePerson: () => void;
};

function ProfileSquare({
  person,
  directory,
}: {
  person: Pick<OrgPerson, 'employeeId' | 'name' | 'photo' | 'title'>;
  directory: DirectoryPerson[];
}) {
  const photo = getPersonDisplayPhoto(person, directory);
  const employeeId = getPersonEmployeeId(person, directory);
  const displayName = getPersonDisplayName(person, directory);

  return (
    <div className="org-identity-panel__hero">
      <div className="org-identity-panel__photo">
        <ProfilePhotoImg
          src={photo}
          employeeId={employeeId}
          className="org-identity-panel__photo-img"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          fallback={<User size={64} strokeWidth={1.25} />}
        />
      </div>
      <div className="org-identity-panel__caption">
        <h2 className="org-identity-panel__name">{displayName}</h2>
        <p className="org-identity-panel__title">{getPersonDisplayTitle(person, directory)}</p>
      </div>
    </div>
  );
}

function HierarchyChart({
  chain,
  currentId,
  onSelectPerson,
}: {
  chain: ReportingChainLink[];
  currentId: string;
  onSelectPerson: (id: string) => void;
}) {
  if (chain.length <= 1) return null;

  return (
    <section className="org-info-panel__section org-info-panel__section--hierarchy">
      <h3 className="org-info-panel__section-label">Hierarchy chart</h3>
      <div className="org-hierarchy-chart" aria-label="Reporting hierarchy chart">
        {chain.map((link, index) => (
          <div key={link.id} className="org-hierarchy-chart__step">
            {index > 0 ? <span className="org-hierarchy-chart__connector" aria-hidden /> : null}
            <button
              type="button"
              className={`org-hierarchy-chart__node${link.id === currentId ? ' is-current' : ''}`}
              onClick={() => onSelectPerson(link.id)}
            >
              <span className="org-hierarchy-chart__dot" />
              <span className="org-hierarchy-chart__text">
                <strong>{link.name}</strong>
                <span>{link.title || '—'}</span>
              </span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OrgSidePanel({
  open,
  mode,
  root,
  person,
  reports,
  directory,
  isAdmin,
  canRemove,
  onClose,
  onSelectPerson,
  onAddMember,
  onEditPerson,
  onRemovePerson,
}: Props) {
  const profile = getPersonProfileDetails(person, directory);
  const reportingChain = mode === 'details' ? getReportingChain(root, person.id) : [];

  return (
    <div className={`org-panel-stage${open ? ' is-open' : ''}`}>
      <div className={`org-detail-split${open ? ' is-open' : ''}`}>
        <div className="org-panel-mobile-bar">
          <button type="button" className="org-panel-mobile-back" onClick={onClose}>
            <ChevronLeft size={18} aria-hidden />
            <span>Back to org chart</span>
          </button>
        </div>
        {/* Panel 2 — identity */}
        <aside className="org-identity-panel" aria-label="Employee identity">
          <ProfileSquare person={person} directory={directory} />
        </aside>

        {/* Panel 3 — contact & details */}
        <aside
          className="org-info-panel"
          aria-label={mode === 'details' ? 'Employee details' : 'Managed AVGCians'}
        >
          <div className="org-info-panel__top">
            {reportingChain.length > 1 ? (
              <nav className="org-info-panel__chain" aria-label="Reporting hierarchy">
                {reportingChain.map((link, index) => (
                  <span key={link.id} className="org-info-panel__chain-part">
                    <button
                      type="button"
                      className={`org-info-panel__chain-link${link.id === person.id ? ' is-current' : ''}`}
                      onClick={() => onSelectPerson(link.id)}
                    >
                      {link.name}
                    </button>
                    {index < reportingChain.length - 1 ? (
                      <span className="org-info-panel__chain-sep" aria-hidden>
                        /
                      </span>
                    ) : null}
                  </span>
                ))}
              </nav>
            ) : (
              <span className="org-info-panel__chain-spacer" />
            )}
            <button type="button" className="org-info-panel__close" onClick={onClose} aria-label="Close panel">
              <X size={18} />
            </button>
          </div>

          {mode === 'details' ? (
            <>
              <HierarchyChart chain={reportingChain} currentId={person.id} onSelectPerson={onSelectPerson} />

              <section className="org-info-panel__section">
                <h3 className="org-info-panel__section-label">Profile</h3>
                <dl className="org-info-panel__fields">
                  <div>
                    <dt>Name</dt>
                    <dd>{profile.name}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{profile.phone}</dd>
                  </div>
                  <div>
                    <dt>Date of birth</dt>
                    <dd>{profile.dateOfBirth}</dd>
                  </div>
                  <div className="org-info-panel__field--about">
                    <dt>About</dt>
                    <dd>{profile.about}</dd>
                  </div>
                </dl>
              </section>

              {isAdmin ? (
                <div className="org-info-panel__actions">
                  <button type="button" className="org-panel__btn-edit" onClick={onEditPerson}>
                    <Pencil size={16} />
                    Edit
                  </button>
                  <button type="button" className="org-panel__btn-add" onClick={onAddMember}>
                    <UserPlus size={16} />
                    Add report
                  </button>
                  {canRemove ? (
                    <button type="button" className="org-panel__btn-remove" onClick={onRemovePerson}>
                      <Trash2 size={16} />
                      Remove
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <section className="org-info-panel__section">
              <h3 className="org-info-panel__section-label">
                Manages {reports.length} AVGCian{reports.length === 1 ? '' : 's'}
              </h3>
              {isAdmin ? (
                <button type="button" className="org-panel__btn-add org-panel__btn-add--block" onClick={onAddMember}>
                  <UserPlus size={16} />
                  Add team member
                </button>
              ) : null}
              {reports.length === 0 ? (
                <p className="org-panel__empty">No AVGCians managed by this person yet.</p>
              ) : (
                <ul className="org-panel__reports-list">
                  {reports.map((report) => {
                    const reportPhoto = getPersonDisplayPhoto(report, directory);
                    const reportEmployeeId = getPersonEmployeeId(report, directory);
                    return (
                      <li key={report.id}>
                        <button
                          type="button"
                          className="org-panel__report-row"
                          onClick={() => onSelectPerson(report.id)}
                        >
                          <span className="org-panel__report-avatar">
                            <ProfilePhotoImg
                              src={reportPhoto}
                              employeeId={reportEmployeeId}
                              fallback={<User size={18} strokeWidth={1.5} />}
                            />
                          </span>
                          <span className="org-panel__report-meta">
                            <strong>{report.name}</strong>
                            <span>{report.title}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
