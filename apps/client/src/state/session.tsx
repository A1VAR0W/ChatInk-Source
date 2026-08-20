import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import type { RoomAccessResponse, SessionResponse } from '@pictochat/shared';

const SESSION_KEY = 'doodledrop.session';
const ROOMS_KEY = 'doodledrop.rooms';

function readJson<T>(key: string): T | undefined {
  try {
    const value = sessionStorage.getItem(key);
    return value === null ? undefined : JSON.parse(value) as T;
  } catch {
    sessionStorage.removeItem(key);
    return undefined;
  }
}

function readSession(): SessionResponse | undefined {
  const session = readJson<SessionResponse>(SESSION_KEY);
  if (session !== undefined && session.expiresAt > Date.now()) return session;
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(ROOMS_KEY);
  return undefined;
}

interface SessionContextValue {
  session?: SessionResponse;
  setSession: (session: SessionResponse) => void;
  clearSession: () => void;
  rememberRoom: (access: RoomAccessResponse) => void;
  roomAccess: (roomId: string) => RoomAccessResponse | undefined;
  forgetRoom: (roomId: string) => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, updateSession] = useState<SessionResponse | undefined>(readSession);
  const [rooms, setRooms] = useState<Record<string, RoomAccessResponse>>(() => readJson(ROOMS_KEY) ?? {});

  const setSession = useCallback((value: SessionResponse) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    updateSession(value);
  }, []);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ROOMS_KEY);
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
    setSession,
    clearSession,
    rememberRoom,
    roomAccess: (roomId) => rooms[roomId],
    forgetRoom,
  }), [session, setSession, clearSession, rememberRoom, rooms, forgetRoom]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === undefined) throw new Error('SessionProvider no esta disponible');
  return value;
}
