export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="ChatInk">
      <img className="brand__mark" src="/icons/icon-192.png" alt="" />
      <span>Chat<span>Ink</span></span>
    </div>
  );
}
