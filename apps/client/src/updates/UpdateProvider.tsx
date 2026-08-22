import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { UpdateChannel, UpdateRelease } from '@pictochat/shared';
import {
  UPDATE_CHECK_INTERVAL_MS,
  UpdateCheckError,
  automaticChecksEnabled,
  decideUpdate,
  fetchUpdateManifest,
  readInstalledVersion,
  type InstalledVersion,
} from './updateService';
import { CLIENT_VERSION_UNSUPPORTED_EVENT } from '../platform/clientMetadata';
import { UpdateExperience } from './UpdateExperience';

const LAST_CHECK_KEY = 'chatink.update.last-check';
const DISMISSED_VERSION_KEY = 'chatink.update.dismissed-version';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'current' | 'empty' | 'offline' | 'error';

type UpdateContextValue = {
  installed: InstalledVersion | undefined;
  status: UpdateStatus;
  release: UpdateRelease | undefined;
  channel: UpdateChannel | undefined;
  mandatory: boolean;
  dialogOpen: boolean;
  webUpdateAvailable: boolean;
  checkForUpdates: (manual?: boolean) => Promise<void>;
  dismissUpdate: () => void;
  closeDialog: () => void;
  applyWebUpdate: () => void;
};

const UpdateContext = createContext<UpdateContextValue | undefined>(undefined);

type UpdateProviderProps = PropsWithChildren<{
  fetchManifest?: typeof fetchUpdateManifest;
}>;

function readTimestamp(): number {
  try {
    const value = Number(localStorage.getItem(LAST_CHECK_KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function rememberCheck(): void {
  try {
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
  } catch {
    // El almacenamiento no es necesario para seguir usando la aplicación.
  }
}

function isDismissed(version: string): boolean {
  try {
    return localStorage.getItem(DISMISSED_VERSION_KEY) === version;
  } catch {
    return false;
  }
}

function rememberDismissal(version: string): void {
  try {
    localStorage.setItem(DISMISSED_VERSION_KEY, version);
  } catch {
    // La actualización sigue siendo opcional incluso si el navegador no guarda la preferencia.
  }
}

function observeServiceWorker(onUpdate: (registration: ServiceWorkerRegistration) => void): () => void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return () => undefined;
  let disposed = false;
  let registration: ServiceWorkerRegistration | undefined;
  let installing: ServiceWorker | null = null;

  const notify = () => {
    if (!disposed && registration?.waiting !== undefined && registration.waiting !== null) onUpdate(registration);
  };
  const onStateChange = () => {
    if (installing?.state === 'installed') notify();
  };
  const onUpdateFound = () => {
    installing?.removeEventListener('statechange', onStateChange);
    installing = registration?.installing ?? null;
    installing?.addEventListener('statechange', onStateChange);
  };

  void navigator.serviceWorker.getRegistration().then((current) => {
    if (disposed || current === undefined) return;
    registration = current;
    registration.addEventListener('updatefound', onUpdateFound);
    notify();
  }).catch(() => undefined);

  return () => {
    disposed = true;
    registration?.removeEventListener('updatefound', onUpdateFound);
    installing?.removeEventListener('statechange', onStateChange);
  };
}

export function UpdateProvider({ children, fetchManifest = fetchUpdateManifest }: UpdateProviderProps) {
  const installedRef = useRef<InstalledVersion | undefined>(undefined);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const launchCheckStarted = useRef(false);
  const [installed, setInstalled] = useState<InstalledVersion>();
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [release, setRelease] = useState<UpdateRelease>();
  const [channel, setChannel] = useState<UpdateChannel>();
  const [mandatory, setMandatory] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [webUpdateAvailable, setWebUpdateAvailable] = useState(false);
  const [launchCheckComplete, setLaunchCheckComplete] = useState(() => !Capacitor.isNativePlatform());

  const loadInstalled = useCallback(async (): Promise<InstalledVersion> => {
    if (installedRef.current !== undefined) return installedRef.current;
    const resolved = await readInstalledVersion();
    installedRef.current = resolved;
    setInstalled(resolved);
    return resolved;
  }, []);

  const checkForUpdates = useCallback(async (manual = false) => {
    setStatus('checking');
    try {
      const current = await loadInstalled();
      const manifest = await fetchManifest();
      const decision = decideUpdate(manifest, current);
      if (decision.kind === 'available') {
        setRelease(decision.release);
        setChannel(manifest.channel);
        setMandatory(decision.mandatory);
        const shouldOpen = manual || decision.mandatory || !isDismissed(decision.release.version);
        setDialogOpen(shouldOpen);
        setStatus(shouldOpen ? 'available' : 'idle');
        return;
      }
      setRelease(undefined);
      setChannel(undefined);
      setMandatory(false);
      setDialogOpen(false);
      setStatus(decision.kind);
    } catch (error) {
      setRelease(undefined);
      setChannel(undefined);
      setMandatory(false);
      setDialogOpen(false);
      setStatus(error instanceof UpdateCheckError && (error.code === 'network' || error.code === 'timeout') ? 'offline' : 'error');
    } finally {
      setLaunchCheckComplete(true);
    }
  }, [fetchManifest, loadInstalled]);

  const dismissUpdate = useCallback(() => {
    if (release !== undefined && !mandatory) rememberDismissal(release.version);
    if (!mandatory) {
      setDialogOpen(false);
      setStatus('idle');
    }
  }, [mandatory, release]);

  const closeDialog = useCallback(() => {
    if (!mandatory) setDialogOpen(false);
  }, [mandatory]);

  const applyWebUpdate = useCallback(() => {
    const registration = registrationRef.current;
    if (registration?.waiting !== undefined && registration.waiting !== null) {
      const reload = () => window.location.reload();
      navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    window.location.reload();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    void loadInstalled().then((current) => {
      // Una app nativa comprueba cada vez que se abre. No mostramos ningún
      // control manual en el chat: la versión nueva llega como aviso.
      if (cancelled) return;
      if (current.platform === 'web' || !automaticChecksEnabled()) {
        setLaunchCheckComplete(true);
        return;
      }
      if (launchCheckStarted.current) return;
      launchCheckStarted.current = true;
      timer = window.setTimeout(() => {
        rememberCheck();
        void checkForUpdates();
      }, 0);
    });
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [checkForUpdates, loadInstalled]);

  useEffect(() => {
    const onUnsupported = () => {
      setLaunchCheckComplete(false);
      void checkForUpdates(true);
    };
    window.addEventListener(CLIENT_VERSION_UNSUPPORTED_EVENT, onUnsupported);
    return () => window.removeEventListener(CLIENT_VERSION_UNSUPPORTED_EVENT, onUnsupported);
  }, [checkForUpdates]);

  useEffect(() => {
    let removeListener: (() => Promise<void>) | undefined;
    void App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive || !automaticChecksEnabled() || Date.now() - readTimestamp() < UPDATE_CHECK_INTERVAL_MS) return;
      void loadInstalled().then((current) => {
        if (current.platform === 'web') return;
        rememberCheck();
        void checkForUpdates();
      });
    }).then((handle) => { removeListener = handle.remove; }).catch(() => undefined);
    return () => { void removeListener?.(); };
  }, [checkForUpdates, loadInstalled]);

  useEffect(() => observeServiceWorker((registration) => {
    registrationRef.current = registration;
    if (!Capacitor.isNativePlatform()) {
      const worker = registration.waiting;
      if (worker === null || worker === undefined) return;
      const reload = () => window.location.reload();
      navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
      worker.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    setWebUpdateAvailable(true);
    setDialogOpen(true);
  }), []);

  const value = useMemo<UpdateContextValue>(() => ({
    installed,
    status,
    release,
    channel,
    mandatory,
    dialogOpen,
    webUpdateAvailable,
    checkForUpdates,
    dismissUpdate,
    closeDialog,
    applyWebUpdate,
  }), [applyWebUpdate, channel, checkForUpdates, closeDialog, dialogOpen, dismissUpdate, installed, mandatory, release, status, webUpdateAvailable]);

  const blockUntilNativePolicyChecked = !launchCheckComplete && (installed === undefined || installed.platform !== 'web');
  return (
    <UpdateContext.Provider value={value}>
      {blockUntilNativePolicyChecked ? <div className="app-loading" role="status">Comprobando la compatibilidad de ChatInk…</div> : children}
      <UpdateExperience />
    </UpdateContext.Provider>
  );
}

export function useUpdates(): UpdateContextValue {
  const context = useContext(UpdateContext);
  if (context === undefined) throw new Error('useUpdates debe utilizarse dentro de UpdateProvider.');
  return context;
}
