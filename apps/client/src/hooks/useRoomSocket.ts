import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientToServerEvents,
  DrawingParticipant,
  DrawingPayload,
  Participant,
  RoomAccessResponse,
  RoomMessage,
  ServerToClientEvents,
  SessionResponse,
  SocketAcknowledgement,
  TypingParticipant,
} from '@pictochat/shared';
import { io, type Socket } from 'socket.io-client';
import { SERVER_URL } from '../services/api';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'closed';
export type DisplayMessage = RoomMessage & { pending?: boolean; failed?: boolean };

function ordered(messages: DisplayMessage[]): DisplayMessage[] {
  return [...messages].sort((left, right) => {
    if (left.pending !== right.pending) return left.pending ? 1 : -1;
    return left.sequence - right.sequence || left.createdAt - right.createdAt;
  });
}

export function useRoomSocket(access: RoomAccessResponse, session: SessionResponse) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [typingParticipants, setTypingParticipants] = useState<TypingParticipant[]>([]);
  const [drawingParticipants, setDrawingParticipants] = useState<DrawingParticipant[]>([]);
  const [error, setError] = useState<string>();
  const [closedReason, setClosedReason] = useState<string>();
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | undefined>(undefined);

  useEffect(() => {
    const endpoint = SERVER_URL || window.location.origin;
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(endpoint, {
      path: '/socket.io',
      auth: { sessionToken: session.token, roomToken: access.roomToken },
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 600,
      reconnectionDelayMax: 5_000,
      timeout: 12_000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
      setError(undefined);
    });
    socket.on('disconnect', (reason) => {
      setTypingParticipants([]);
      setDrawingParticipants([]);
      if (reason === 'io server disconnect' || reason === 'io client disconnect') setStatus('closed');
      else setStatus('reconnecting');
    });
    socket.io.on('reconnect_attempt', () => setStatus('reconnecting'));
    socket.io.on('reconnect_failed', () => {
      setStatus('offline');
      setError('No se pudo recuperar la conexion. Comprueba tu red e intentalo de nuevo.');
    });
    socket.on('connect_error', (socketError) => {
      setStatus('reconnecting');
      setError(socketError.message || 'No se pudo conectar con la sala');
    });
    socket.on('room:state', (state) => {
      setMessages(ordered(state.messages));
      setParticipants(state.participants);
      setTypingParticipants([]);
      setDrawingParticipants([]);
    });
    socket.on('room:participants', setParticipants);
    socket.on('room:typing', (activeParticipants) => {
      setTypingParticipants(activeParticipants.filter((participant) => participant.id !== session.sessionId));
    });
    socket.on('room:drawing', (activeParticipants) => {
      setDrawingParticipants(activeParticipants.filter((participant) => participant.id !== session.sessionId));
    });
    socket.on('message:new', (message) => {
      setMessages((current) => ordered([...current.filter((item) => item.clientId !== message.clientId), message]));
    });
    socket.on('server:error', (payload) => {
      setError(payload.message);
      if (payload.clientId !== undefined) {
        setMessages((current) => current.map((item) => item.clientId === payload.clientId ? { ...item, pending: false, failed: true } : item));
      }
    });
    socket.on('room:closed', ({ reason }) => {
      const reasons = {
        creator: 'La persona que creo la sala la ha cerrado.',
        empty: 'La sala se elimino tras permanecer vacia.',
        shutdown: 'El servidor se ha reiniciado y el contenido temporal ya no existe.',
      };
      setClosedReason(reasons[reason]);
      setStatus('closed');
    });

    return () => {
      if (socket.connected) {
        socket.emit('typing:set', { isTyping: false });
        socket.emit('drawing:set', { isDrawing: false });
      }
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      socketRef.current = undefined;
    };
  }, [access.roomToken, session.sessionId, session.token]);

  const send = useCallback((kind: 'text' | 'drawing', value: string | DrawingPayload, replyToId?: string) => {
    const socket = socketRef.current;
    if (socket === undefined || !socket.connected) {
      setError('Espera a que se recupere la conexion antes de enviar.');
      return;
    }
    const clientId = crypto.randomUUID();
    const createdAt = Date.now();
    const message: DisplayMessage = kind === 'text'
      ? {
          id: clientId,
          clientId,
          roomId: access.room.id,
          sequence: Number.MAX_SAFE_INTEGER,
          createdAt,
          sender: { id: session.sessionId, alias: session.alias },
          kind: 'text',
          text: value as string,
          pending: true,
        }
      : {
          id: clientId,
          clientId,
          roomId: access.room.id,
          sequence: Number.MAX_SAFE_INTEGER,
          createdAt,
          sender: { id: session.sessionId, alias: session.alias },
          kind: 'drawing',
          drawing: value as DrawingPayload,
          pending: true,
        };
    setMessages((current) => ordered([...current, message]));
    const input = kind === 'text'
      ? { clientId, kind: 'text' as const, text: value as string, ...(replyToId === undefined ? {} : { replyToId }) }
      : { clientId, kind: 'drawing' as const, drawing: value as DrawingPayload, ...(replyToId === undefined ? {} : { replyToId }) };
    socket.emit('message:send', input, (acknowledgement: SocketAcknowledgement) => {
      if (!acknowledgement.ok) {
        setMessages((current) => current.map((item) => item.clientId === clientId ? { ...item, pending: false, failed: true } : item));
        setError(acknowledgement.message);
      }
    });
  }, [access.room.id, session.alias, session.sessionId]);

  const closeRoom = useCallback(() => new Promise<SocketAcknowledgement>((resolve) => {
    const socket = socketRef.current;
    if (socket === undefined || !socket.connected) {
      resolve({ ok: false, code: 'OFFLINE', message: 'No hay conexion con la sala' });
      return;
    }
    socket.emit('room:close', resolve);
  }), []);

  const setTyping = useCallback((isTyping: boolean) => {
    const socket = socketRef.current;
    if (socket?.connected) socket.emit('typing:set', { isTyping });
  }, []);

  const setDrawing = useCallback((isDrawing: boolean) => {
    const socket = socketRef.current;
    if (socket?.connected) socket.emit('drawing:set', { isDrawing });
  }, []);

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (socket === undefined) return;
    if (socket.connected) {
      socket.emit('typing:set', { isTyping: false });
      socket.emit('drawing:set', { isDrawing: false });
    }
    socket.disconnect();
  }, []);

  return {
    status,
    messages,
    participants,
    typingParticipants,
    drawingParticipants,
    error,
    closedReason,
    sendText: (text: string, replyToId?: string) => send('text', text, replyToId),
    sendDrawing: (drawing: DrawingPayload, replyToId?: string) => send('drawing', drawing, replyToId),
    setTyping,
    setDrawing,
    leaveRoom,
    closeRoom,
    clearError: () => setError(undefined),
  };
}
