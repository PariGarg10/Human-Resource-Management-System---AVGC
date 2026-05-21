export function PlaceholderPanel({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm">
      <h2 className="font-['Bebas_Neue',sans-serif] text-xl tracking-wide text-[var(--text-primary)]">{title}</h2>
      <p className="mt-2 font-['DM_Sans',sans-serif] text-sm text-[var(--text-muted)]">
        This area is reserved for a future release.
      </p>
    </div>
  );
}
