import type { CSSProperties } from 'react';

function initials(alias: string): string {
  const parts = alias.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('es') || '?';
}

function avatarHue(alias: string): number {
  return [...alias].reduce((hash, character) => (hash * 31 + character.codePointAt(0)!) % 360, 211);
}

export function Avatar({ alias, className = '', label = true }: { alias: string; className?: string; label?: boolean }) {
  const style = { '--avatar-hue': avatarHue(alias) } as CSSProperties;
  return <span className={`avatar ${className}`.trim()} style={style} aria-label={label ? `Avatar de ${alias}` : undefined}>{initials(alias)}</span>;
}
