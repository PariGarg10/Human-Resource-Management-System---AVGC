type Props = { value: number; max?: number };

export function RatingDots({ value, max = 5 }: Props) {
  return (
    <div className="perf-rating-dots" aria-label={`Rating ${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`perf-rating-dot${i < value ? ' is-filled' : ''}`} />
      ))}
    </div>
  );
}
