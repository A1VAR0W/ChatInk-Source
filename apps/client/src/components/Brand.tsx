export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="Chat-Ink">
      <span className="brand__mark" aria-hidden="true">〰</span>
      <span>Chat<span>-Ink</span></span>
    </div>
  );
}
