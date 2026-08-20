import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@pictochat/shared';
import { sendMessageSchema } from '@pictochat/shared';
import type { Server } from 'socket.io';
import type { AppConfig } from '../config.js';
import { DomainError, type RoomService } from '../domain/room-service.js';
import { MemoryRateLimiter } from '../security/rate-limiter.js';
import { TokenError, type TokenService } from '../security/tokens.js';

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerSocketServer(
  io: RealtimeServer,
  roomService: RoomService,
  tokens: TokenService,
  config: Pick<AppConfig, 'allowedOrigins' | 'messageRateLimitPerMinute' | 'connectionRateLimitPerMinute'>,
): void {
  const limiter = new MemoryRateLimiter();
  const disconnectTimers = new Map<string, NodeJS.Timeout>();

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
      io.to(roomId).emit('room:closed', { reason });
      io.in(roomId).disconnectSockets(true);
    },
  });

  io.on('connection', (socket) => {
    const { sessionId, alias, roomId } = socket.data;
    const disconnectKey = `${roomId}:${sessionId}`;
    const pendingDisconnect = disconnectTimers.get(disconnectKey);
    if (pendingDisconnect !== undefined) {
      clearTimeout(pendingDisconnect);
      disconnectTimers.delete(disconnectKey);
    }

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

    socket.on('disconnect', () => {
      const timer = setTimeout(() => {
        roomService.disconnectParticipant(roomId, sessionId, socket.id);
        disconnectTimers.delete(disconnectKey);
      }, 5_000);
      timer.unref();
      disconnectTimers.set(disconnectKey, timer);
    });
  });
}
