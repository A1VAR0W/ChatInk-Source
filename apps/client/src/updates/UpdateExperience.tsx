import { formatBytes } from '@pictochat/shared';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { updateUrlForPlatform } from './updateService';
import { useUpdates } from './UpdateProvider';

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function statusMessage(status: ReturnType<typeof useUpdates>['status']): string | undefined {
  if (status === 'checking') return 'Buscando actualizaciones…';
  if (status === 'current') return 'Ya tienes la última versión.';
  if (status === 'empty') return 'Todavía no hay una versión pública disponible.';
  if (status === 'offline') return 'No pudimos comprobarlo ahora. Revisa tu conexión e inténtalo de nuevo.';
  if (status === 'error') return 'No se pudo comprobar la actualización. Puedes seguir usando ChatInk.';
  return undefined;
}

export function UpdateExperience() {
  const updates = useUpdates();
  const location = useLocation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [iosCopyState, setIosCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const release = updates.release;
  const useWebUpdate = updates.webUpdateAvailable && updates.installed?.platform === 'web';
  const open = updates.dialogOpen && (release !== undefined || useWebUpdate);
  const message = statusMessage(updates.status);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => primaryActionRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  const close = () => {
    if (updates.mandatory) return;
    setIosCopyState('idle');
    updates.dismissUpdate();
  };

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !updates.mandatory) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href]');
    if (controls === undefined || controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const copyIosSource = async () => {
    if (release === undefined) return;
    try {
      await navigator.clipboard.writeText(release.platforms.ios.sourceUrl);
      setIosCopyState('copied');
    } catch {
      setIosCopyState('failed');
    }
  };

  const primaryAction = () => {
    if (useWebUpdate) {
      updates.applyWebUpdate();
      return;
    }
    if (release === undefined) return;
    if (updates.installed?.platform === 'android') {
      const url = updateUrlForPlatform(release, 'android');
      if (url !== undefined) openExternal(url);
      return;
    }
    if (updates.installed?.platform === 'ios') {
      void copyIosSource();
      return;
    }
    openExternal(release.releaseUrl);
  };

  const primaryLabel = useWebUpdate
    ? 'Recargar ahora'
    : updates.installed?.platform === 'android'
      ? 'Descargar APK'
      : updates.installed?.platform === 'ios'
        ? 'Copiar fuente de SideStore'
        : 'Ver información de la release';

  return (
    <>
      <aside className={`update-surface ${location.pathname.startsWith('/room/') ? 'update-surface--room' : ''}`} aria-live="polite" aria-label="Actualizaciones de ChatInk">
        <span>Versión {updates.installed?.version ?? '…'}</span>
        <button type="button" className="text-button" onClick={() => void updates.checkForUpdates(true)} disabled={updates.status === 'checking'}>
          {updates.status === 'checking' ? 'Buscando…' : 'Buscar actualizaciones'}
        </button>
        {message !== undefined && <p role={updates.status === 'offline' || updates.status === 'error' ? 'status' : undefined}>{message}</p>}
      </aside>

      {open && (
        <div className="update-backdrop" role="presentation">
          <div
            ref={dialogRef}
            className="update-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-dialog-title"
            aria-describedby="update-dialog-description"
            onKeyDown={trapFocus}
          >
            <div className="update-dialog__eyebrow">CHATINK</div>
            <h2 id="update-dialog-title">{useWebUpdate ? 'Actualización web lista' : 'Nueva versión disponible'}</h2>
            {!useWebUpdate && release !== undefined && (
              <>
                <p id="update-dialog-description" className="update-dialog__lead">
                  Tienes la versión <strong>{updates.installed?.version ?? 'actual'}</strong>. La versión <strong>{release.version}</strong> está lista.
                </p>
                <dl className="update-dialog__facts">
                  <div><dt>Versión instalada</dt><dd>{updates.installed?.version ?? '—'}</dd></div>
                  <div><dt>Versión nueva</dt><dd>{release.version}</dd></div>
                  {updates.installed?.platform !== 'web' && <div><dt>Tamaño</dt><dd>{formatBytes(updates.installed?.platform === 'ios' ? release.platforms.ios.size : release.platforms.android.size)}</dd></div>}
                </dl>
                {release.notes.length > 0 && (
                  <section className="update-dialog__notes" aria-label="Notas de la versión">
                    <h3>Novedades</h3>
                    <ul>{release.notes.map((note) => <li key={note}>{note}</li>)}</ul>
                  </section>
                )}
                {updates.installed?.platform === 'android' && <p className="update-dialog__hint">Android puede pedirte autorización para instalar desde esta fuente. ChatInk nunca instala un APK en segundo plano.</p>}
                {updates.installed?.platform === 'ios' && (
                  <section className="update-dialog__ios" aria-label="Instrucciones de SideStore o AltStore">
                    <p>Abre SideStore o AltStore, añade esta fuente y deja que firme el IPA con tu cuenta Apple. No es una instalación directa ni de App Store.</p>
                    <label htmlFor="sidestore-source">URL de la fuente</label>
                    <input id="sidestore-source" readOnly value={release.platforms.ios.sourceUrl} onFocus={(event) => event.currentTarget.select()} />
                    {iosCopyState === 'copied' && <p className="update-dialog__success" role="status">URL copiada. Pégala en SideStore o AltStore.</p>}
                    {iosCopyState === 'failed' && <p className="update-dialog__hint" role="status">Selecciona y copia la URL manualmente.</p>}
                  </section>
                )}
              </>
            )}
            {useWebUpdate && <p id="update-dialog-description" className="update-dialog__lead">La nueva versión de la aplicación web ya está descargada. Recarga para activarla.</p>}
            <div className="update-dialog__actions">
              {!updates.mandatory && <button type="button" className="button button--secondary" onClick={close}>Más tarde</button>}
              {updates.installed?.platform === 'ios' && release !== undefined && <button type="button" className="button button--secondary" onClick={() => openExternal(release.releaseUrl)}>Ver release</button>}
              <button ref={primaryActionRef} type="button" className="button" onClick={primaryAction}>{primaryLabel}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
