type Props = {
  value?: number | null;
  onChange?: (value: number) => void;
  disabled?: boolean;
};

export function RatingButtons({ value, onChange, disabled }: Props) {
  return (
    <div className="perf-rating-buttons" role="group" aria-label="Rating 1 to 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`perf-rating-btn${value === n ? ' is-selected' : ''}`}
          disabled={disabled}
          onClick={() => onChange?.(n)}
          aria-pressed={value === n}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
