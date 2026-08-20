import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import type { AppConfig } from '../config.js';

interface SessionClaims extends JWTPayload {
  kind: 'session';
  sid: string;
  alias: string;
}

interface RoomClaims extends JWTPayload {
  kind: 'room';
  sid: string;
  rid: string;
  role: 'creator' | 'member';
}

export class TokenError extends Error {}

export class TokenService {
  readonly #secret: Uint8Array;
  readonly #sessionTtlMs: number;
  readonly #roomTtlMs: number;
  readonly #issuer = 'doodledrop-server';

  constructor(config: Pick<AppConfig, 'tokenSecret' | 'sessionTtlMs' | 'roomTokenTtlMs'>) {
    this.#secret = new TextEncoder().encode(config.tokenSecret);
    this.#sessionTtlMs = config.sessionTtlMs;
    this.#roomTtlMs = config.roomTokenTtlMs;
  }

  async createSession(alias: string): Promise<{ sessionId: string; token: string; expiresAt: number }> {
    const sessionId = randomUUID();
    const expiresAt = Date.now() + this.#sessionTtlMs;
    const token = await new SignJWT({ kind: 'session', sid: sessionId, alias })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.#issuer)
      .setAudience('doodledrop-client')
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt / 1000))
      .setJti(randomUUID())
      .sign(this.#secret);
    return { sessionId, token, expiresAt };
  }

  async verifySession(token: string): Promise<SessionClaims> {
    try {
      const { payload } = await jwtVerify(token, this.#secret, {
        issuer: this.#issuer,
        audience: 'doodledrop-client',
      });
      if (payload.kind !== 'session' || typeof payload.sid !== 'string' || typeof payload.alias !== 'string') {
        throw new TokenError('Token de sesion no valido');
      }
      return payload as SessionClaims;
    } catch (error) {
      if (error instanceof TokenError) throw error;
      throw new TokenError('Token de sesion no valido');
    }
  }

  async createRoomToken(sessionId: string, roomId: string, role: 'creator' | 'member'): Promise<string> {
    const expiresAt = Date.now() + this.#roomTtlMs;
    return new SignJWT({ kind: 'room', sid: sessionId, rid: roomId, role })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.#issuer)
      .setAudience('doodledrop-room')
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt / 1000))
      .setJti(randomUUID())
      .sign(this.#secret);
  }

  async verifyRoom(token: string): Promise<RoomClaims> {
    try {
      const { payload } = await jwtVerify(token, this.#secret, {
        issuer: this.#issuer,
        audience: 'doodledrop-room',
      });
      if (
        payload.kind !== 'room' ||
        typeof payload.sid !== 'string' ||
        typeof payload.rid !== 'string' ||
        (payload.role !== 'creator' && payload.role !== 'member')
      ) {
        throw new TokenError('Token de sala no valido');
      }
      return payload as RoomClaims;
    } catch (error) {
      if (error instanceof TokenError) throw error;
      throw new TokenError('Token de sala no valido');
    }
  }
}

export function bearerToken(authorization: string | undefined): string {
  if (authorization === undefined || !authorization.startsWith('Bearer ')) {
    throw new TokenError('Falta autorizacion');
  }
  const token = authorization.slice(7).trim();
  if (token.length === 0) throw new TokenError('Falta autorizacion');
  return token;
}
