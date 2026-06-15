import { useState } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { toast } from '@/lib/toast';
import type { PerformanceOkr } from './performanceTypes';

function okrKey(o: Partial<PerformanceOkr> & { id?: number }, idx: number) {
  return o.clientKey || (o.id != null ? `id-${o.id}` : `idx-${idx}`);
}

const EMPTY_DRAFT = () => ({
  objective: '',
  keyResult: '',
  kra: '',
  kpi: '',
  weightage: '',
});

type Props = {
  okrs: PerformanceOkr[];
  okrsLocked: boolean;
  isManagerView: boolean;
  weightTotal: number;
  onChange: (idx: number, patch: Partial<PerformanceOkr>) => void;
  onAdd: (draft: { objective: string; keyResult: string; kra: string; kpi: string; weightage: number }) => void;
  onRemove: (idx: number) => void;
  onSubmit?: () => void;
  onSaveManager?: () => void;
  onLock?: () => void;
  showManagerActions?: boolean;
  showEmployeeSubmit?: boolean;
};

export function OkrSetupEditor({
  okrs,
  okrsLocked,
  isManagerView,
  weightTotal,
  onChange,
  onAdd,
  onRemove,
  onSubmit,
  onSaveManager,
  onLock,
  showManagerActions,
  showEmployeeSubmit = true,
}: Props) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const canEdit = !okrsLocked;
  const weightOk = Math.abs(weightTotal - 100) < 0.01;

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const objective = draft.objective.trim();
    const keyResult = draft.keyResult.trim();
    const kra = draft.kra.trim();
    const kpi = draft.kpi.trim();
    const weightage = Number(draft.weightage);
    if (!objective || !keyResult || !kra || !kpi) {
      toast('Fill objective, key result, KRA, and KPI', 'error');
      return;
    }
    if (!Number.isFinite(weightage) || weightage <= 0) {
      toast('Enter a positive weightage for this OKR', 'error');
      return;
    }
    onAdd({ objective, keyResult, kra, kpi, weightage });
    setDraft(EMPTY_DRAFT());
  }

  return (
    <div className="performance-okr-board">
      <div className="performance-okr-summary">
        <p className="stat-sub">
          Total weightage:{' '}
          <strong className={weightOk ? 'performance-okr-weight-ok' : 'performance-okr-weight-bad'}>
            {weightTotal}
          </strong>{' '}
          / 100
        </p>
        {okrsLocked ? <StatusBadge status="approved" /> : <StatusBadge status="pending" />}
      </div>

      {canEdit ? (
        <form className="performance-okr-add-form" onSubmit={handleAdd}>
          <input
            value={draft.objective}
            onChange={(e) => setDraft((p) => ({ ...p, objective: e.target.value }))}
            placeholder="Objective"
            aria-label="Objective"
          />
          <input
            value={draft.keyResult}
            onChange={(e) => setDraft((p) => ({ ...p, keyResult: e.target.value }))}
            placeholder="Key result"
            aria-label="Key result"
          />
          <input
            value={draft.kra}
            onChange={(e) => setDraft((p) => ({ ...p, kra: e.target.value }))}
            placeholder="KRA"
            aria-label="KRA"
          />
          <input
            value={draft.kpi}
            onChange={(e) => setDraft((p) => ({ ...p, kpi: e.target.value }))}
            placeholder="KPI"
            aria-label="KPI"
          />
          <input
            type="number"
            min={1}
            max={100}
            value={draft.weightage}
            onChange={(e) => setDraft((p) => ({ ...p, weightage: e.target.value }))}
            placeholder="Weightage"
            aria-label="Weightage"
          />
          <button type="submit" className="btn btn-outline btn-sm performance-okr-add-btn">
            Add OKR
          </button>
        </form>
      ) : null}

      {okrs.length === 0 ? (
        <p className="performance-okr-empty">
          {canEdit ? 'No OKRs yet — add your first OKR above.' : 'No OKRs defined for this quarter.'}
        </p>
      ) : (
        <ul className="performance-okr-list">
          {okrs.map((o, idx) => (
            <li key={okrKey(o, idx)} className="performance-okr-card">
              <div className="performance-okr-card-head">
                <span className="performance-okr-card-num">OKR {idx + 1}</span>
                <span className="performance-okr-card-weight">{Number(o.weightage) || 0}%</span>
                {canEdit ? (
                  <button
                    type="button"
                    className="performance-okr-remove"
                    title="Remove OKR"
                    aria-label={`Remove OKR ${idx + 1}`}
                    onClick={() => onRemove(idx)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              {canEdit ? (
                <div className="performance-okr-card-fields">
                  <label className="performance-okr-field">
                    <span>Objective</span>
                    <input value={o.objective} onChange={(e) => onChange(idx, { objective: e.target.value })} />
                  </label>
                  <label className="performance-okr-field">
                    <span>Key result</span>
                    <input value={o.keyResult} onChange={(e) => onChange(idx, { keyResult: e.target.value })} />
                  </label>
                  <label className="performance-okr-field">
                    <span>KRA</span>
                    <input value={o.kra} onChange={(e) => onChange(idx, { kra: e.target.value })} />
                  </label>
                  <label className="performance-okr-field">
                    <span>KPI</span>
                    <input value={o.kpi} onChange={(e) => onChange(idx, { kpi: e.target.value })} />
                  </label>
                  <label className="performance-okr-field performance-okr-field--weight">
                    <span>Weightage</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={o.weightage || ''}
                      onChange={(e) => onChange(idx, { weightage: Number(e.target.value) })}
                    />
                  </label>
                </div>
              ) : (
                <dl className="performance-okr-readonly">
                  <div>
                    <dt>Objective</dt>
                    <dd>{o.objective}</dd>
                  </div>
                  <div>
                    <dt>Key result</dt>
                    <dd>{o.keyResult}</dd>
                  </div>
                  <div>
                    <dt>KRA</dt>
                    <dd>{o.kra}</dd>
                  </div>
                  <div>
                    <dt>KPI</dt>
                    <dd>{o.kpi}</dd>
                  </div>
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="performance-okr-actions">
          {!isManagerView && showEmployeeSubmit ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!weightOk || okrs.length === 0}
              onClick={() => onSubmit?.()}
            >
              Submit OKRs to manager
            </button>
          ) : null}
          {showManagerActions ? (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onSaveManager?.()}>
                Save changes
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onLock?.()}>
                Approve & lock OKRs
              </button>
            </>
          ) : null}
          {!weightOk && okrs.length > 0 ? (
            <p className="stat-sub performance-okr-hint">Weightage across all OKRs must equal exactly 100.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
