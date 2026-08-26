import { createReadStream, createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import {
  aliasSchema,
  createRoomSchema,
  joinRoomSchema,
  roomCodeSchema,
  type ApiError,
  type RoomAccessResponse,
  type SessionResponse,
  type UploadResponse,
} from '@pictochat/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { clientVersionSupported, unsupportedClientPayload } from './compatibility/client-version.js';
import type { AppConfig } from './config.js';
import type { Database } from './database/database.js';
import { AccountError, type AccountRepository } from './domain/account-repository.js';
import { DomainError, type RoomService } from './domain/room-service.js';
import type { MemoryRateLimiter } from './security/rate-limiter.js';
import { bearerToken, TokenError, type TokenService } from './security/tokens.js';
import { detectAllowedMime } from './storage/file-validation.js';
import { contentDisposition, safeDownloadName, type TempStorage } from './storage/temp-storage.js';
import type { AntivirusScanner } from './storage/virus-scanner.js';

const createSessionSchema = z.object({ alias: aliasSchema });
const usernameSchema = z.string().trim().min(2).max(24)
  .regex(/^[\p{L}\p{N}._-]+$/u, 'Usa letras, numeros, punto, guion o guion bajo');
const accountCredentialsSchema = z.object({
  username: usernameSchema,
  password: z.string().min(10).max(128),
}).strict();
const settingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  fontScale: z.number().min(0.8).max(2).optional(),
  reducedMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  notifyMessages: z.boolean().optional(),
  notifyFriendRequests: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Incluye al menos un ajuste');
const friendRequestSchema = z.object({ username: usernameSchema }).strict();
const friendTierSchema = z.object({ tier: z.enum(['normal', 'close']) }).strict();
const uuidParamSchema = z.object({ id: z.uuid() });
const routeRoomCodeSchema = z.object({ code: roomCodeSchema });
const routeRoomFileSchema = z.object({ roomId: z.uuid(), fileId: z.uuid() });

function multipartFieldValue(fields: unknown, name: string): unknown {
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return undefined;
  const field = (fields as Record<string, unknown>)[name];
  const first: unknown = Array.isArray(field) ? field[0] : field;
  if (typeof first !== 'object' || first === null || Array.isArray(first)) return undefined;
  return (first as Record<string, unknown>).value;
}

interface Services {
  config: AppConfig;
  rooms: RoomService;
  tokens: TokenService;
  storage: TempStorage;
  uploads: MemoryRateLimiter;
  antivirus: AntivirusScanner;
  accounts?: AccountRepository;
  database?: Database;
}

function validationError(error: z.ZodError): ApiError {
  const details: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(error.flatten().fieldErrors)) {
    const textMessages = Array.isArray(messages) ? messages.filter((message): message is string => typeof message === 'string') : [];
    if (textMessages.length > 0) details[field] = textMessages;
  }
  return {
    error: 'Los datos enviados no son validos',
    code: 'VALIDATION_ERROR',
    details,
  };
}

async function authenticateSession(request: FastifyRequest, tokens: TokenService) {
  return tokens.verifySession(bearerToken(request.headers.authorization));
}

async function authenticateRoom(request: FastifyRequest, tokens: TokenService, roomId: string) {
  const claims = await tokens.verifyRoom(bearerToken(request.headers.authorization));
  if (claims.rid !== roomId) throw new TokenError('La autorizacion no corresponde a esta sala');
  return claims;
}

async function authenticateAccount(request: FastifyRequest, tokens: TokenService) {
  return tokens.verifyAccount(bearerToken(request.headers.authorization));
}

export function registerRoutes(app: FastifyInstance, services: Services): void {
  const { config, rooms, tokens, storage, uploads, antivirus, accounts, database } = services;

  app.get('/api/health', async () => {
    await database?.ping();
    return { status: 'ok', rooms: 'ephemeral', accounts: database === undefined ? 'disabled' : 'postgresql', timestamp: Date.now() };
  });
  app.get('/api/client-policy', () => ({
    minimumSupportedVersion: config.minSupportedClientVersion,
    latestVersion: config.latestClientVersion,
    releaseUrl: config.clientReleaseUrl,
  }));

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.url === '/api/health' || request.url === '/api/client-policy' || request.method === 'OPTIONS') return;
    if (clientVersionSupported(request.headers['x-chatink-client-version'], {
      minimumSupportedVersion: config.minSupportedClientVersion,
      latestVersion: config.latestClientVersion,
      releaseUrl: config.clientReleaseUrl,
    })) return;
    return reply.code(426).send(unsupportedClientPayload({
      minimumSupportedVersion: config.minSupportedClientVersion,
      latestVersion: config.latestClientVersion,
      releaseUrl: config.clientReleaseUrl,
    }));
  });

  app.post('/api/sessions', async (request, reply): Promise<SessionResponse | ApiError> => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    const session = await tokens.createSession(parsed.data.alias);
    return { ...session, alias: parsed.data.alias };
  });

  app.post('/api/accounts/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    if (accounts === undefined) return reply.code(503).send({ error: 'Las cuentas no estan disponibles', code: 'ACCOUNTS_DISABLED' });
    const parsed = accountCredentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    const account = await accounts.register(parsed.data.username, parsed.data.password);
    const authentication = await tokens.createAccountToken(account.id, account.username);
    return reply.code(201).send({ account, ...authentication });
  });

  app.post('/api/accounts/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    if (accounts === undefined) return reply.code(503).send({ error: 'Las cuentas no estan disponibles', code: 'ACCOUNTS_DISABLED' });
    const parsed = accountCredentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    const account = await accounts.authenticate(parsed.data.username, parsed.data.password);
    const authentication = await tokens.createAccountToken(account.id, account.username);
    return { account, ...authentication };
  });

  app.get('/api/accounts/me', async (request, reply) => {
    if (accounts === undefined) return reply.code(503).send({ error: 'Las cuentas no estan disponibles', code: 'ACCOUNTS_DISABLED' });
    const claims = await authenticateAccount(request, tokens);
    const [account, accountSettings] = await Promise.all([
      accounts.findById(claims.uid),
      accounts.getSettings(claims.uid),
    ]);
    return { account, settings: accountSettings };
  });

  app.patch('/api/accounts/settings', async (request, reply) => {
    if (accounts === undefined) return reply.code(503).send({ error: 'Las cuentas no estan disponibles', code: 'ACCOUNTS_DISABLED' });
    const claims = await authenticateAccount(request, tokens);
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    return { settings: await accounts.updateSettings(claims.uid, parsed.data) };
  });

  app.get('/api/accounts/friends', async (request, reply) => {
    if (accounts === undefined) return reply.code(503).send({ error: 'Las cuentas no estan disponibles', code: 'ACCOUNTS_DISABLED' });
    const claims = await authenticateAccount(request, tokens);
    return { friends: await accounts.listFriends(claims.uid) };
  });

  app.post('/api/accounts/friends/requests', async (request, reply) => {
    if (accounts === undefined) return reply.code(503).send({ error: 'Las cuentas no estan disponibles', code: 'ACCOUNTS_DISABLED' });
    const claims = await authenticateAccount(request, tokens);
    const parsed = friendRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    return reply.code(201).send({ friendship: await accounts.requestFriend(claims.uid, parsed.data.username) });
  });

  app.post('/api/accounts/friends/requests/:id/accept', async (request, reply) => {
    if (accounts === undefined) return reply.code(503).send({ error: 'Las cuentas no estan disponibles', code: 'ACCOUNTS_DISABLED' });
    const claims = await authenticateAccount(request, tokens);
    const params = uuidParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(validationError(params.error));
    await accounts.acceptFriend(claims.uid, params.data.id);
    return reply.code(204).send();
  });

  app.patch('/api/accounts/friends/:id', async (request, reply) => {
    if (accounts === undefined) return reply.code(503).send({ error: 'Las cuentas no estan disponibles', code: 'ACCOUNTS_DISABLED' });
    const claims = await authenticateAccount(request, tokens);
    const params = uuidParamSchema.safeParse(request.params);
    const body = friendTierSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send(validationError(params.error));
    if (!body.success) return reply.code(400).send(validationError(body.error));
    await accounts.setFriendTier(claims.uid, params.data.id, body.data.tier);
    return reply.code(204).send();
  });

  app.get('/api/rooms/public', () => ({ rooms: rooms.publicRooms() }));

  app.post('/api/rooms', async (request, reply): Promise<RoomAccessResponse | ApiError> => {
    const session = await authenticateSession(request, tokens);
    if (!uploads.consume(`create-room:${session.sid}`, config.createRoomRateLimitPerHour, 3_600_000)) {
      throw new DomainError('RATE_LIMIT', 'Has alcanzado el limite temporal de creacion de salas', 429);
    }
    const parsed = createRoomSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(validationError(parsed.error));
    const room = await rooms.createRoom(session.sid, session.alias, {
      name: parsed.data.name,
      visibility: parsed.data.visibility,
      ...(parsed.data.password === undefined ? {} : { password: parsed.data.password }),
      ...(parsed.data.maxParticipants === undefined ? {} : { maxParticipants: parsed.data.maxParticipants }),
    });
    const roomToken = await tokens.createRoomToken(session.sid, room.id, 'creator');
    return reply.code(201).send({ room, roomToken, role: 'creator' });
  });

  app.post('/api/rooms/:code/join', async (request, reply): Promise<RoomAccessResponse | ApiError> => {
    const session = await authenticateSession(request, tokens);
    const params = routeRoomCodeSchema.safeParse(request.params);
    const body = joinRoomSchema.safeParse(request.body ?? {});
    if (!params.success) return reply.code(400).send(validationError(params.error));
    if (!body.success) return reply.code(400).send(validationError(body.error));
    const access = await rooms.authorizeJoin(params.data.code, session.sid, body.data.password);
    const roomToken = await tokens.createRoomToken(session.sid, access.room.id, access.role);
    return { ...access, roomToken };
  });

  app.post('/api/rooms/:roomId/files', async (request, reply): Promise<UploadResponse | ApiError> => {
    const params = z.object({ roomId: z.uuid() }).parse(request.params);
    const claims = await authenticateRoom(request, tokens, params.roomId);
    if (!rooms.isParticipant(params.roomId, claims.sid)) throw new DomainError('NOT_IN_ROOM', 'Ya no formas parte de la sala', 403);
    if (!uploads.consume(`upload:${claims.sid}`, config.uploadRateLimitPerMinute)) {
      throw new DomainError('RATE_LIMIT', 'Has alcanzado el limite temporal de subidas', 429);
    }

    const part = await request.file({ limits: { fileSize: config.maxFileBytes, files: 1, fields: 3 } });
    if (part === undefined) throw new DomainError('FILE_REQUIRED', 'Selecciona un archivo', 400);
    const clientId = z.uuid().parse(multipartFieldValue(part.fields, 'clientId'));
    const replyToIdRaw = multipartFieldValue(part.fields, 'replyToId');
    const replyToId = replyToIdRaw === undefined || replyToIdRaw === '' ? undefined : z.uuid().parse(replyToIdRaw);
    const fileId = randomUUID();
    const partialPath = await storage.partialPath(params.roomId, fileId);
    let finalPath: string | undefined;
    try {
      await pipeline(part.file, createWriteStream(partialPath, { flags: 'wx', mode: 0o600 }));
      if (part.file.truncated) throw new DomainError('FILE_TOO_LARGE', 'El archivo supera el limite permitido', 413);
      const metadata = await stat(partialPath);
      if (metadata.size === 0) throw new DomainError('EMPTY_FILE', 'El archivo esta vacio', 400);
      if (metadata.size > config.maxFileBytes) throw new DomainError('FILE_TOO_LARGE', 'El archivo supera el limite permitido', 413);
      const mime = await detectAllowedMime(partialPath);
      if (mime === undefined) throw new DomainError('UNSUPPORTED_FILE', 'El tipo real del archivo no esta permitido', 415);
      if (await antivirus.scan(partialPath) === 'infected') throw new DomainError('MALWARE_DETECTED', 'El archivo no ha superado el analisis de seguridad', 422);
      finalPath = await storage.finalize(partialPath, params.roomId, fileId);
      const session = await tokens.verifySession(String(request.headers['x-session-token'] ?? ''));
      if (session.sid !== claims.sid) throw new TokenError('Las credenciales no coinciden');
      const message = rooms.appendFileMessage(params.roomId, claims.sid, session.alias, clientId, {
        id: fileId,
        name: safeDownloadName(part.filename),
        mime,
        size: metadata.size,
        path: finalPath,
        createdAt: Date.now(),
      }, replyToId);
      return reply.code(201).send({ message });
    } catch (error) {
      await storage.removeFile(finalPath ?? partialPath);
      throw error;
    }
  });

  app.get('/api/rooms/:roomId/files/:fileId', async (request, reply) => {
    const params = routeRoomFileSchema.parse(request.params);
    const claims = await authenticateRoom(request, tokens, params.roomId);
    if (!rooms.isParticipant(params.roomId, claims.sid)) throw new DomainError('NOT_IN_ROOM', 'Ya no formas parte de la sala', 403);
    const file = rooms.file(params.roomId, params.fileId);
    reply.header('Content-Type', file.mime);
    reply.header('Content-Length', file.size);
    reply.header('Content-Disposition', contentDisposition(file.name));
    reply.header('Cache-Control', 'private, no-store, max-age=0');
    return reply.send(createReadStream(file.path));
  });
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply: FastifyReply) => {
    if (error instanceof z.ZodError) {
      void reply.code(400).send(validationError(error));
      return;
    }
    if (error instanceof DomainError) {
      void reply.code(error.statusCode).send({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof AccountError) {
      void reply.code(error.statusCode).send({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof TokenError) {
      void reply.code(401).send({ error: 'No autorizado', code: 'UNAUTHORIZED' });
      return;
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'FST_REQ_FILE_TOO_LARGE') {
      void reply.code(413).send({ error: 'El archivo supera el limite permitido', code: 'FILE_TOO_LARGE' });
      return;
    }
    app.log.error({ err: error }, 'request failed');
    void reply.code(500).send({ error: 'Se ha producido un error interno', code: 'INTERNAL_ERROR' });
  });
}
