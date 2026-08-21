import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@pictochat/shared';
import { sendMessageSchema, typingStateSchema, type TypingParticipant } from '@pictochat/shared';
import type { Server } from 'socket.io';
import type { AppConfig } from '../config.js';
import { DomainError, type RoomService } from '../domain/room-service.js';
import { MemoryRateLimiter } from '../security/rate-limiter.js';
import { TokenError, type TokenService } from '../security/tokens.js';

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

interface TypingSession {
  alias: string;
  socketIds: Set<string>;
}

export function registerSocketServer(
  io: RealtimeServer,
  roomService: RoomService,
  tokens: TokenService,
  config: Pick<AppConfig, 'allowedOrigins' | 'messageRateLimitPerMinute' | 'connectionRateLimitPerMinute'>,
): void {
  const limiter = new MemoryRateLimiter();
  const disconnectTimers = new Map<string, { roomId: string; timer: NodeJS.Timeout }>();
  const typingTimers = new Map<string, NodeJS.Timeout>();
  const typingByRoom = new Map<string, Map<string, TypingSession>>();

  const emitTyping = (roomId: string) => {
    const sessions = typingByRoom.get(roomId);
    const participants: TypingParticipant[] = sessions === undefined
      ? []
      : Array.from(sessions, ([id, participant]) => ({ id, alias: participant.alias }))
        .filter((participant) => participant.alias.length > 0)
        .sort((left, right) => left.alias.localeCompare(right.alias, 'es'));
    io.to(roomId).emit('room:typing', participants);
  };

  const clearTypingForSocket = (roomId: string, sessionId: string, socketId: string) => {
    const timer = typingTimers.get(socketId);
    if (timer !== undefined) {
      clearTimeout(timer);
      typingTimers.delete(socketId);
    }
    const sessions = typingByRoom.get(roomId);
    const participant = sessions?.get(sessionId);
    if (participant === undefined || !participant.socketIds.delete(socketId)) return;
    if (participant.socketIds.size > 0) return;
    sessions?.delete(sessionId);
    if (sessions?.size === 0) typingByRoom.delete(roomId);
    emitTyping(roomId);
  };

  const setTyping = (roomId: string, sessionId: string, alias: string, socketId: string, isTyping: boolean) => {
    if (!isTyping) {
      clearTypingForSocket(roomId, sessionId, socketId);
      return;
    }
    const sessions = typingByRoom.get(roomId) ?? new Map<string, TypingSession>();
    const hadTypingSession = sessions.has(sessionId);
    const participant = sessions.get(sessionId) ?? { alias, socketIds: new Set<string>() };
    participant.alias = alias;
    participant.socketIds.add(socketId);
    sessions.set(sessionId, participant);
    typingByRoom.set(roomId, sessions);
    const previousTimer = typingTimers.get(socketId);
    if (previousTimer !== undefined) clearTimeout(previousTimer);
    const timer = setTimeout(() => clearTypingForSocket(roomId, sessionId, socketId), 5_000);
    timer.unref();
    typingTimers.set(socketId, timer);
    if (!hadTypingSession) emitTyping(roomId);
  };

  const clearRoomTyping = (roomId: string) => {
    for (const [socketId, timer] of typingTimers) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket?.data.roomId !== roomId) continue;
      clearTimeout(timer);
      typingTimers.delete(socketId);
    }
    typingByRoom.delete(roomId);
  };

  io.use((socket, next) => {
    void (async () => {
      try {
        const ip = socket.handshake.address;
        if (!limiter.consume(`connection:${ip}`, config.connectionRateLimitPerMinute)) {
          next(new Error('Demasiadas conexiones; espera un minuto'));
          return;
        }
        const sessionToken = typeof socket.handshake.auth.sessionToken === 'string' ? socket.handshake.auth.sessionToken : '';
        const roomToken = typeof socket.handshake.auth.roomToken === 'string' ? socket.handshake.auth.roomToken : '';
        const [session, room] = await Promise.all([tokens.verifySession(sessionToken), tokens.verifyRoom(roomToken)]);
        if (session.sid !== room.sid || !roomService.hasRoom(room.rid)) throw new TokenError('La autorizacion no corresponde a esta sala');
        socket.data = { sessionId: session.sid, alias: session.alias, roomId: room.rid, role: room.role };
        next();
      } catch {
        next(new Error('No se pudo autorizar la conexion'));
      }
    })();
  });

  roomService.setEvents({
    onMessage: (roomId, message) => io.to(roomId).emit('message:new', message),
    onParticipants: (roomId, participants) => io.to(roomId).emit('room:participants', participants),
    onDeleted: (roomId, reason) => {
      clearRoomTyping(roomId);
      for (const [socketId, pending] of disconnectTimers) {
        if (pending.roomId !== roomId) continue;
        clearTimeout(pending.timer);
        disconnectTimers.delete(socketId);
      }
      io.to(roomId).emit('room:closed', { reason });
      io.in(roomId).disconnectSockets(true);
    },
  });

  io.on('connection', (socket) => {
    const { sessionId, alias, roomId } = socket.data;

    try {
      void socket.join(roomId);
      const state = roomService.connectParticipant(roomId, sessionId, alias, socket.id);
      socket.emit('room:state', state);
    } catch (error) {
      const message = error instanceof DomainError ? error.message : 'No se pudo entrar en la sala';
      socket.emit('server:error', { code: 'JOIN_FAILED', message });
      socket.disconnect(true);
      return;
    }

    socket.on('message:send', (rawInput, acknowledge) => {
      try {
        if (!limiter.consume(`message:${sessionId}`, config.messageRateLimitPerMinute)) {
          acknowledge({ ok: false, code: 'RATE_LIMIT', message: 'Estas enviando demasiado rapido' });
          return;
        }
        const input = sendMessageSchema.parse(rawInput);
        const message = roomService.postMessage(roomId, sessionId, alias, input);
        clearTypingForSocket(roomId, sessionId, socket.id);
        acknowledge({ ok: true, messageId: message.id });
      } catch (error) {
        const response = error instanceof DomainError
          ? { code: error.code, message: error.message }
          : { code: 'INVALID_MESSAGE', message: 'El mensaje no es valido' };
        acknowledge({ ok: false, ...response });
      }
    });

    socket.on('room:close', (acknowledge) => {
      void roomService.closeByCreator(roomId, sessionId)
        .then(() => acknowledge({ ok: true }))
        .catch((error: unknown) => {
          const response = error instanceof DomainError
            ? { code: error.code, message: error.message }
            : { code: 'CLOSE_FAILED', message: 'No se pudo cerrar la sala' };
          acknowledge({ ok: false, ...response });
        });
    });

    socket.on('typing:set', (rawInput) => {
      const parsed = typingStateSchema.safeParse(rawInput);
      if (!parsed.success) return;
      setTyping(roomId, sessionId, alias, socket.id, parsed.data.isTyping);
    });

    socket.on('disconnect', () => {
      clearTypingForSocket(roomId, sessionId, socket.id);
      const timer = setTimeout(() => {
        roomService.disconnectParticipant(roomId, sessionId, socket.id);
        disconnectTimers.delete(socket.id);
      }, 5_000);
      timer.unref();
      disconnectTimers.set(socket.id, { roomId, timer });
    });
  });
}
