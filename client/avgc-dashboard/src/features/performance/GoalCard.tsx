import { RatingButtons } from './RatingButtons';
import { RatingDots } from './RatingDots';

type Props = {
  index: number;
  weight: number;
  title: string;
  description: string;
  progress?: number;
  editableProgress?: boolean;
  onProgressChange?: (value: number) => void;
  selfRating?: number | null;
  editableSelfRating?: boolean;
  onSelfRatingChange?: (value: number) => void;
  selfFeedback?: string;
  editableSelfFeedback?: boolean;
  onSelfFeedbackChange?: (value: string) => void;
  managerRating?: number | null;
  editableManagerRating?: boolean;
  onManagerRatingChange?: (value: number) => void;
  managerFeedback?: string;
  managerStatus?: string;
  expanded?: boolean;
  onToggleExpand?: () => void;
  showManagerColumn?: boolean;
};

export function GoalCard({
  index,
  weight,
  title,
  description,
  progress = 0,
  editableProgress,
  onProgressChange,
  selfRating,
  editableSelfRating,
  onSelfRatingChange,
  selfFeedback,
  editableSelfFeedback,
  onSelfFeedbackChange,
  managerRating,
  editableManagerRating,
  onManagerRatingChange,
  managerFeedback,
  managerStatus,
  expanded,
  onToggleExpand,
  showManagerColumn = true,
}: Props) {
  const pct = Math.min(100, Math.max(0, progress));

  return (
    <article className={`perf-goal-card${expanded ? ' is-expanded' : ''}`}>
      <div className="perf-goal-card-top">
        <div className="perf-goal-card-meta">
          <p className="perf-goal-eyebrow">
            Goal {index + 1} · Weight {weight}%
          </p>
          <button
            type="button"
            className="perf-goal-title-btn"
            onClick={onToggleExpand}
            disabled={!onToggleExpand}
          >
            <h3 className="perf-goal-title">{title}</h3>
          </button>
          <p className="perf-goal-desc">{description}</p>
        </div>
        <div className="perf-goal-progress-wrap">
          <div className="perf-goal-progress-label">
            <span>Progress</span>
            <strong>{pct}%</strong>
          </div>
          {editableProgress ? (
            <input
              type="range"
              min={0}
              max={100}
              value={pct}
              className="perf-goal-progress-range"
              onChange={(e) => onProgressChange?.(Number(e.target.value))}
            />
          ) : (
            <div className="perf-goal-progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </div>

      {(editableSelfFeedback || (expanded && selfFeedback)) && (
        <div className="perf-goal-feedback-block">
          <label className="perf-goal-rating-label">Your feedback on this goal</label>
          {editableSelfFeedback ? (
            <textarea
              className="perf-goal-feedback-input"
              rows={3}
              placeholder="Describe outcomes, challenges, and evidence for this KRA…"
              value={selfFeedback || ''}
              onChange={(e) => onSelfFeedbackChange?.(e.target.value)}
            />
          ) : (
            <p className="perf-goal-feedback-text">{selfFeedback}</p>
          )}
        </div>
      )}

      {expanded && managerFeedback && (
        <div className="perf-goal-feedback-block perf-goal-feedback-block--manager">
          <label className="perf-goal-rating-label">Manager feedback</label>
          <p className="perf-goal-feedback-text">{managerFeedback}</p>
        </div>
      )}

      <div className="perf-goal-card-ratings">
        <div className="perf-goal-rating-col">
          <span className="perf-goal-rating-label">Your rating</span>
          {editableSelfRating ? (
            <RatingButtons value={selfRating} onChange={onSelfRatingChange} />
          ) : selfRating != null ? (
            <RatingDots value={selfRating} />
          ) : (
            <span className="perf-goal-awaiting">Not rated</span>
          )}
        </div>
        {showManagerColumn && (
          <div className="perf-goal-rating-col">
            <span className="perf-goal-rating-label">Manager rating</span>
            {editableManagerRating ? (
              <RatingButtons value={managerRating} onChange={onManagerRatingChange} />
            ) : managerRating != null ? (
              <RatingDots value={managerRating} />
            ) : (
              <span className="perf-goal-awaiting">{managerStatus || 'Awaiting manager'}</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
