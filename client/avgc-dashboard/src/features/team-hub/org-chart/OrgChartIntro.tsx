import { Network, Users } from 'lucide-react';

type Props = {
  onEnter: () => void;
};

export function OrgChartIntro({ onEnter }: Props) {
  return (
    <div className="org-intro">
      <div className="org-intro__glow" aria-hidden />
      <div className="org-intro__content">
        <div className="org-intro__icon-wrap">
          <Network size={36} strokeWidth={1.5} />
        </div>
        <h2>Organization overview</h2>
        <p>
          Explore how AVGC Studios is structured — leadership, teams, and reporting lines in one interactive
          view. Start from the CEO and expand each level at your own pace.
        </p>
        <ul className="org-intro__points">
          <li>
            <Users size={16} />
            <span>Click any person to expand or collapse their team</span>
          </li>
          <li>
            <Network size={16} />
            <span>Hover for quick details and direct reports</span>
          </li>
        </ul>
        <button type="button" className="org-intro__cta" onClick={onEnter}>
          Open organization chart
        </button>
      </div>
    </div>
  );
}
