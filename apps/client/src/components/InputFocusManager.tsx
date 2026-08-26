import { useEffect } from 'react';

function editableField(target: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | undefined {
  if (target instanceof HTMLTextAreaElement) return target;
  if (!(target instanceof HTMLInputElement)) return undefined;
  return ['text', 'email', 'password', 'search', 'tel', 'url', 'number'].includes(target.type) ? target : undefined;
}

function bringIntoView(field: HTMLElement, block: ScrollLogicalPosition) {
  const viewport = window.visualViewport;
  const bounds = field.getBoundingClientRect();
  const top = viewport?.offsetTop ?? 0;
  const bottom = top + (viewport?.height ?? window.innerHeight);
  if (bounds.top >= top + 12 && bounds.bottom <= bottom - 12) return;
  field.scrollIntoView({ block, inline: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

export function InputFocusManager() {
  useEffect(() => {
    const focusedOnce = new WeakSet<HTMLElement>();
    let active: HTMLInputElement | HTMLTextAreaElement | undefined;
    let focusTimers: number[] = [];

    const clearTimers = () => {
      for (const timer of focusTimers) window.clearTimeout(timer);
      focusTimers = [];
    };
    const onFocus = (event: FocusEvent) => {
      const field = editableField(event.target);
      if (field === undefined) return;
      active = field;
      if (focusedOnce.has(field)) return;
      focusedOnce.add(field);
      clearTimers();
      focusTimers = [40, 280].map((delay) => window.setTimeout(() => bringIntoView(field, 'center'), delay));
    };
    const onInput = (event: Event) => {
      const field = editableField(event.target);
      if (field !== undefined) window.requestAnimationFrame(() => bringIntoView(field, 'nearest'));
    };
    const onBlur = (event: FocusEvent) => {
      if (event.target === active) active = undefined;
      clearTimers();
    };
    const onViewportResize = () => {
      if (active !== undefined) window.requestAnimationFrame(() => bringIntoView(active!, 'nearest'));
    };

    document.addEventListener('focusin', onFocus);
    document.addEventListener('input', onInput);
    document.addEventListener('focusout', onBlur);
    window.visualViewport?.addEventListener('resize', onViewportResize);
    return () => {
      clearTimers();
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('input', onInput);
      document.removeEventListener('focusout', onBlur);
      window.visualViewport?.removeEventListener('resize', onViewportResize);
    };
  }, []);
  return null;
}
