import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export function ReplyIcon(props: IconProps) {
  return <Icon {...props}><path d="M9 17 4 12l5-5" /><path d="M4 12h10a6 6 0 0 1 6 6" /></Icon>;
}

export function PencilIcon(props: IconProps) {
  return <Icon {...props}><path d="m14 5 5 5" /><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" /></Icon>;
}

export function EraserIcon(props: IconProps) {
  return <Icon {...props}><path d="m7 20-4-4a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3l-8 8a2 2 0 0 1-3 0Z" /><path d="M7 20h13" /><path d="m12 7 5 5" /></Icon>;
}

export function FillIcon(props: IconProps) {
  return <Icon {...props}><path d="m14 4 6 6-7.5 7.5a3.2 3.2 0 0 1-4.5 0L4.5 14a3.2 3.2 0 0 1 0-4.5L9 5" /><path d="m9 5 6 6" /><path d="M17 18c0 1.1-.9 2-2 2s-2-.9-2-2 2-4 2-4 2 2.9 2 4Z" /></Icon>;
}

export function UndoIcon(props: IconProps) {
  return <Icon {...props}><path d="M9 8 5 12l4 4" /><path d="M5 12h9a5 5 0 0 1 5 5v1" /></Icon>;
}

export function RedoIcon(props: IconProps) {
  return <Icon {...props}><path d="m15 8 4 4-4 4" /><path d="M19 12h-9a5 5 0 0 0-5 5v1" /></Icon>;
}

export function TrashIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></Icon>;
}

export function CanvasIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 15l3-3 3 3 2-2 3 3" /><path d="M8 9h.01" /></Icon>;
}

export function InkMarkIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 3c3.8 4.1 6 6.9 6 10.1A6 6 0 1 1 6 13.1C6 9.9 8.2 7.1 12 3Z" /><path d="M9.5 14.5c.8 1.2 2 1.8 3.5 1.8" /></Icon>;
}

export function ExitIcon(props: IconProps) {
  return <Icon {...props}><path d="M10 5H5v14h5" /><path d="m14 8 4 4-4 4" /><path d="M18 12H9" /></Icon>;
}

export function PeopleIcon(props: IconProps) {
  return <Icon {...props}><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20" /><circle cx="10" cy="7" r="3" /><path d="M16 10a3 3 0 0 0 0-6" /><path d="M20 20v-1.5a4.5 4.5 0 0 0-2.5-4" /></Icon>;
}
