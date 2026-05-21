import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const MOCK_WEEKS = [
  { week: 'W1', score: 72 },
  { week: 'W2', score: 78 },
  { week: 'W3', score: 81 },
  { week: 'W4', score: 88 },
];

type Props = {
  /** Optional override from real summary — scales bars visually */
  productivityHint?: number;
};

export function ProductivityChart({ productivityHint }: Props) {
  const data = MOCK_WEEKS.map((row, i) =>
    i === MOCK_WEEKS.length - 1 && productivityHint != null
      ? { ...row, score: Math.min(100, Math.round(productivityHint)) }
      : row
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-2 lg:col-span-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Monthly productivity
          </h3>
          <p className="mt-1 text-xs text-slate-500">Attendance-weighted score by week (demo)</p>
        </div>
      </div>
      <div className="mt-4 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: '#64748b', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(26,35,126,0.06)' }}
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                fontSize: '12px',
              }}
            />
            <Bar dataKey="score" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
