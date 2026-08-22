import { Capacitor } from '@capacitor/core';
import { useEffect } from 'react';

// `adjustResize` is the primary Android fix. This fallback runs only on old
// WebViews that leave innerHeight at the physical screen height while their
// visual viewport shrinks for the IME, so it cannot double-apply the inset.
export function useAndroidVisibleViewport(): void {
  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (Capacitor.getPlatform() !== 'android' || visualViewport === null || visualViewport === undefined) return;
    const root = document.documentElement;
    const update = () => {
      if (visualViewport.height >= window.innerHeight - 1) {
        root.style.removeProperty('--chatink-visible-viewport-height');
        return;
      }
      root.style.setProperty('--chatink-visible-viewport-height', `${Math.round(visualViewport.height)}px`);
    };
    update();
    visualViewport.addEventListener('resize', update);
    visualViewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      visualViewport.removeEventListener('resize', update);
      visualViewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      root.style.removeProperty('--chatink-visible-viewport-height');
    };
  }, []);
}
