export function PlaceholderPanel({ title }: { title: string }) {
  return (
    <div className="panel">
      <h2 className="panel-title">{title}</h2>
      <p className="stat-sub" style={{ marginTop: 8 }}>
        Manager-specific module — configuration coming soon.
      </p>
    </div>
  );
}
