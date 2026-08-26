import { existsSync } from 'node:fs';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import type { AppConfig } from './config.js';
import { Database } from './database/database.js';
import { AccountRepository } from './domain/account-repository.js';
import { RoomService } from './domain/room-service.js';
import { registerSocketServer, type RealtimeServer } from './realtime/register-socket.js';
import { registerErrorHandler, registerRoutes } from './routes.js';
import { MemoryRateLimiter } from './security/rate-limiter.js';
import { TokenService } from './security/tokens.js';
import { TempStorage } from './storage/temp-storage.js';
import { SignatureOnlyScanner } from './storage/virus-scanner.js';

export interface PictoApplication {
  app: FastifyInstance;
  io: RealtimeServer;
  rooms: RoomService;
  tokens: TokenService;
  storage: TempStorage;
  database?: Database;
  startCleanup: () => void;
  shutdown: () => Promise<void>;
}

export async function buildApplication(config: AppConfig): Promise<PictoApplication> {
  const app = Fastify({
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
    requestTimeout: 30_000,
    connectionTimeout: 15_000,
    logger: config.nodeEnv === 'test'
      ? false
      : {
          level: config.nodeEnv === 'production' ? 'info' : 'debug',
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.x-session-token',
              'req.body',
              'res.body',
              '*.token',
              '*.password',
              '*.message',
              '*.drawing',
              '*.file',
            ],
            censor: '[REDACTED]',
          },
        },
  });

  const storage = new TempStorage(config.tempRoot);
  await storage.initialize();
  const database = config.databaseUrl === undefined ? undefined : new Database(config.databaseUrl);
  await database?.initialize();
  const accounts = database === undefined ? undefined : new AccountRepository(database);
  const tokens = new TokenService(config);
  const rooms = new RoomService(config, storage);
  const uploads = new MemoryRateLimiter();
  const antivirus = new SignatureOnlyScanner();

  await app.register(helmet, {
    contentSecurityPolicy: config.serveClient
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'blob:', 'data:'],
            mediaSrc: ["'self'", 'blob:'],
            connectSrc: ["'self'", 'ws:', 'wss:'],
          },
        }
      : false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(cors, {
    origin: (origin, callback) => {
      if (origin === undefined || config.allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error('Origen no permitido'), false);
    },
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token', 'X-ChatInk-Client-Version', 'X-ChatInk-Client-Build', 'X-ChatInk-Client-Platform', 'X-ChatInk-Client-Channel'],
    credentials: false,
    maxAge: 600,
  });
  await app.register(rateLimit, {
    max: config.apiRateLimitPerMinute,
    timeWindow: '1 minute',
    hook: 'onRequest',
    errorResponseBuilder: () => ({ error: 'Demasiadas solicitudes', code: 'RATE_LIMIT' }),
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: config.maxFileBytes, fields: 3, parts: 4 },
    throwFileSizeLimit: true,
  });

  registerErrorHandler(app);
  registerRoutes(app, {
    config,
    rooms,
    tokens,
    storage,
    uploads,
    antivirus,
    ...(accounts === undefined ? {} : { accounts }),
    ...(database === undefined ? {} : { database }),
  });

  if (config.serveClient && existsSync(config.clientDist)) {
    await app.register(fastifyStatic, { root: config.clientDist, prefix: '/' });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || !request.headers.accept?.includes('text/html')) {
        void reply.code(404).send({ error: 'Recurso no encontrado', code: 'NOT_FOUND' });
        return;
      }
      void reply.sendFile('index.html');
    });
  }

  const io: RealtimeServer = new Server(app.server, {
    path: '/socket.io',
    cors: { origin: config.allowedOrigins, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 2 * 1024 * 1024,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    transports: ['websocket', 'polling'],
  });
  registerSocketServer(io, rooms, tokens, config);

  let cleanupTimer: NodeJS.Timeout | undefined;
  const runCleanup = async () => {
    try {
      await rooms.sweep();
      await storage.cleanupOrphans(rooms.activeRoomIds(), config.orphanMaxAgeMs);
      uploads.sweep();
    } catch (error) {
      app.log.error({ err: error }, 'cleanup failed');
    }
  };
  const startCleanup = () => {
    if (cleanupTimer !== undefined) return;
    cleanupTimer = setInterval(() => void runCleanup(), config.cleanupIntervalMs);
    cleanupTimer.unref();
  };
  const shutdown = async () => {
    if (cleanupTimer !== undefined) clearInterval(cleanupTimer);
    await rooms.shutdown();
    await io.close();
    if (app.server.listening) await app.close();
    await storage.shutdown();
    await database?.close();
  };

  return { app, io, rooms, tokens, storage, ...(database === undefined ? {} : { database }), startCleanup, shutdown };
}
