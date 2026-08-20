export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="DoodleDrop">
      <span className="brand__mark" aria-hidden="true">〰</span>
      <span>Doodle<span>Drop</span></span>
    </div>
  );
}
