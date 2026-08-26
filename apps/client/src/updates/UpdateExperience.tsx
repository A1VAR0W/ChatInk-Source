import { formatBytes } from '@pictochat/shared';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { updateUrlForPlatform } from './updateService';
import { useUpdates } from './UpdateProvider';

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function UpdateExperience() {
  const updates = useUpdates();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [iosCopyState, setIosCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const release = updates.release;
  const isPreproduction = updates.channel === 'preproduction';
  const useWebUpdate = updates.webUpdateAvailable && updates.installed?.platform === 'web';
  const open = updates.dialogOpen && ((updates.installed?.platform !== 'web' && release !== undefined) || useWebUpdate);

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

  useEffect(() => {
    if (!open || !updates.mandatory || !Capacitor.isNativePlatform()) return;
    let remove: (() => Promise<void>) | undefined;
    void NativeApp.addListener('backButton', () => {
      // Back may close the native app, but it must never dismiss this gate.
      void NativeApp.exitApp();
    }).then((handle) => { remove = handle.remove; });
    return () => { void remove?.(); };
  }, [open, updates.mandatory]);

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
            <h2 id="update-dialog-title">{useWebUpdate ? 'Actualización web lista' : updates.mandatory ? 'Debes actualizar ChatInk' : 'Nueva versión disponible'}</h2>
            {!useWebUpdate && release !== undefined && (
              <>
                <p id="update-dialog-description" className="update-dialog__lead">
                  {updates.mandatory
                    ? 'Esta versión ya no es compatible y no puede seguir conectándose al servicio.'
                    : `Tienes la versión ${updates.installed?.version ?? 'actual'}. La versión ${release.version} está lista.`}
                </p>
                <dl className="update-dialog__facts">
                  <div><dt>Versión instalada</dt><dd>{updates.installed?.version ?? '—'}</dd></div>
                  <div><dt>{updates.mandatory ? 'Versión mínima permitida' : 'Versión nueva'}</dt><dd>{release.minimumSupportedVersion ?? release.version}</dd></div>
                  {updates.mandatory && <div><dt>Última versión disponible</dt><dd>{release.version}</dd></div>}
                  {updates.installed?.platform !== 'web' && <div><dt>Tamaño</dt><dd>{formatBytes(updates.installed?.platform === 'ios' ? release.platforms.ios.size : release.platforms.android.size)}</dd></div>}
                </dl>
                {release.notes.length > 0 && (
                  <section className="update-dialog__notes" aria-label="Notas de la versión">
                    <h3>Novedades</h3>
                    <ul>{release.notes.map((note) => <li key={note}>{note}</li>)}</ul>
                  </section>
                )}
                {updates.installed?.platform === 'android' && (
                  <section className="update-dialog__steps" aria-label="Pasos para actualizar en Android">
                    <h3>Cómo actualizar en Android</h3>
                    <ol><li>Pulsa «Descargar APK».</li><li>Abre el archivo descargado y permite instalar desde esta fuente si Android lo solicita.</li><li>Instala la nueva versión y vuelve a abrir ChatInk.</li></ol>
                    <p className="update-dialog__hint">ChatInk nunca instala un APK en segundo plano.</p>
                  </section>
                )}
                {updates.installed?.platform === 'ios' && (
                  <section className="update-dialog__ios" aria-label="Instrucciones de SideStore o AltStore">
                    <h3>Cómo actualizar en iPhone</h3>
                    <ol>
                      <li>Abre SideStore o AltStore y entra en «Sources».</li>
                      <li>Añade la URL de abajo y actualiza la fuente.</li>
                      <li>Abre ChatInk desde la fuente e instala o refresca la versión nueva.</li>
                    </ol>
                    <p>{isPreproduction ? 'Esta es la fuente de preproducción. También puedes descargar el IPA e importarlo manualmente en SideStore.' : 'También puedes descargar el IPA e importarlo manualmente en SideStore o AltStore.'} No es una instalación de App Store.</p>
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
              {updates.mandatory && <button type="button" className="button button--secondary" onClick={() => void updates.checkForUpdates(true)}>Reintentar</button>}
              {updates.installed?.platform === 'ios' && release !== undefined && <button type="button" className="button button--secondary" onClick={() => openExternal(release.platforms.ios.downloadUrl)}>Descargar IPA</button>}
              {updates.installed?.platform === 'ios' && release !== undefined && !isPreproduction && <button type="button" className="button button--secondary" onClick={() => openExternal(release.releaseUrl)}>Ver release</button>}
              <button ref={primaryActionRef} type="button" className="button" onClick={primaryAction}>{updates.mandatory ? 'Actualizar ahora' : primaryLabel}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
