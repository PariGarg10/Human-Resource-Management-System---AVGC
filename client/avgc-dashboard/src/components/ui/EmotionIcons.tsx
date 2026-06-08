const EMOTIONS = [
  { key: 'happy', label: 'Happy', emoji: '😊' },
  { key: 'sad', label: 'Sad', emoji: '😢' },
  { key: 'angry', label: 'Angry', emoji: '😠' },
  { key: 'excited', label: 'Excited', emoji: '🤩' },
  { key: 'surprised', label: 'Surprised', emoji: '😲' },
] as const;

type Props = {
  size?: 'sm' | 'md';
  onSelect?: (key: string) => void;
  selected?: string | null;
};

export function EmotionIcons({ size = 'md', onSelect, selected }: Props) {
  const dim = size === 'sm' ? '2rem' : '2.5rem';
  const fontSize = size === 'sm' ? '1.1rem' : '1.35rem';

  return (
    <div className="emotion-icons" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {EMOTIONS.map((e) => (
        <button
          key={e.key}
          type="button"
          title={e.label}
          aria-label={e.label}
          onClick={() => onSelect?.(e.key)}
          style={{
            width: dim,
            height: dim,
            borderRadius: '50%',
            border: selected === e.key ? '2px solid #ed1d24' : '2px solid var(--border, #ebebec)',
            background: 'var(--bg-card, #fff)',
            fontSize,
            cursor: onSelect ? 'pointer' : 'default',
            transition: 'border-color 0.2s, transform 0.2s',
          }}
        >
          {e.emoji}
        </button>
      ))}
    </div>
  );
}
