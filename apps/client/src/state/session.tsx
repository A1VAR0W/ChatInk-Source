import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { AccountAuthentication, AccountIdentity, RoomAccessResponse, SessionResponse } from '@pictochat/shared';
import { api } from '../services/api';

const SESSION_KEY = 'doodledrop.session';
const ROOMS_KEY = 'doodledrop.rooms';
const ACCOUNT_KEY = 'chatink.remembered-account';

export interface ClientSession extends SessionResponse {
  mode: 'guest' | 'account';
  account?: AccountIdentity;
  accountToken?: string;
  accountExpiresAt?: number;
}

function readJson<T>(key: string): T | undefined {
  try {
    const value = sessionStorage.getItem(key);
    return value === null ? undefined : JSON.parse(value) as T;
  } catch {
    sessionStorage.removeItem(key);
    return undefined;
  }
}

function readSession(): ClientSession | undefined {
  const session = readJson<ClientSession>(SESSION_KEY);
  if (session !== undefined && session.expiresAt > Date.now()) return session;
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(ROOMS_KEY);
  return undefined;
}

interface SessionContextValue {
  session?: ClientSession;
  restoringAccount: boolean;
  setGuestSession: (session: SessionResponse) => void;
  setAccountSession: (session: SessionResponse, authentication: AccountAuthentication, remember: boolean) => void;
  clearSession: () => void;
  rememberRoom: (access: RoomAccessResponse) => void;
  roomAccess: (roomId: string) => RoomAccessResponse | undefined;
  forgetRoom: (roomId: string) => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, updateSession] = useState<ClientSession | undefined>(readSession);
  const [rooms, setRooms] = useState<Record<string, RoomAccessResponse>>(() => readJson(ROOMS_KEY) ?? {});
  const [restoringAccount, setRestoringAccount] = useState(() => session === undefined && localStorage.getItem(ACCOUNT_KEY) !== null);

  const storeSession = useCallback((value: ClientSession) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    updateSession(value);
  }, []);

  const setGuestSession = useCallback((value: SessionResponse) => {
    localStorage.removeItem(ACCOUNT_KEY);
    storeSession({ ...value, mode: 'guest' });
  }, [storeSession]);

  const setAccountSession = useCallback((value: SessionResponse, authentication: AccountAuthentication, remember: boolean) => {
    const next: ClientSession = {
      ...value,
      mode: 'account',
      account: authentication.account,
      accountToken: authentication.token,
      accountExpiresAt: authentication.expiresAt,
    };
    if (remember) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(authentication));
    else localStorage.removeItem(ACCOUNT_KEY);
    storeSession(next);
  }, [storeSession]);

  useEffect(() => {
    if (!restoringAccount) return;
    let cancelled = false;
    const restore = async () => {
      try {
        const remembered = JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null') as AccountAuthentication | null;
        if (remembered === null || remembered.expiresAt <= Date.now()) throw new Error('Sesion recordada caducada');
        const [{ account }, chatSession] = await Promise.all([
          api.accountMe(remembered.token),
          api.createSession(remembered.account.username),
        ]);
        if (cancelled) return;
        const refreshed = { ...remembered, account };
        localStorage.setItem(ACCOUNT_KEY, JSON.stringify(refreshed));
        storeSession({
          ...chatSession,
          mode: 'account',
          account,
          accountToken: remembered.token,
          accountExpiresAt: remembered.expiresAt,
        });
      } catch {
        localStorage.removeItem(ACCOUNT_KEY);
      } finally {
        if (!cancelled) setRestoringAccount(false);
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, [restoringAccount, storeSession]);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ROOMS_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
    setRooms({});
    updateSession(undefined);
  }, []);

  const rememberRoom = useCallback((access: RoomAccessResponse) => {
    setRooms((current) => {
      const next = { ...current, [access.room.id]: access };
      sessionStorage.setItem(ROOMS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const forgetRoom = useCallback((roomId: string) => {
    setRooms((current) => {
      const next = { ...current };
      delete next[roomId];
      sessionStorage.setItem(ROOMS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo<SessionContextValue>(() => ({
    ...(session === undefined ? {} : { session }),
    restoringAccount,
    setGuestSession,
    setAccountSession,
    clearSession,
    rememberRoom,
    roomAccess: (roomId) => rooms[roomId],
    forgetRoom,
  }), [session, restoringAccount, setGuestSession, setAccountSession, clearSession, rememberRoom, rooms, forgetRoom]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === undefined) throw new Error('SessionProvider no esta disponible');
  return value;
}
