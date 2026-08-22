import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const positiveInteger = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  TOKEN_SECRET: z.string().min(32).default('development-only-secret-change-me-now'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3001'),
  TRUST_PROXY: booleanFromString,
  SERVE_CLIENT: booleanFromString,
  CLIENT_DIST: z.string().default('apps/client/dist'),
  TEMP_ROOT: z.string().optional(),
  SESSION_TTL_MS: positiveInteger(43_200_000),
  ROOM_TOKEN_TTL_MS: positiveInteger(86_400_000),
  ROOM_EMPTY_TTL_MS: positiveInteger(300_000),
  CLEANUP_INTERVAL_MS: positiveInteger(60_000),
  ORPHAN_MAX_AGE_MS: positiveInteger(3_600_000),
  ROOM_MAX_PARTICIPANTS: positiveInteger(24),
  ROOMS_PER_SESSION: positiveInteger(5),
  MAX_MESSAGES_PER_ROOM: positiveInteger(500),
  MAX_FILE_BYTES: positiveInteger(26_214_400),
  MAX_FILES_PER_ROOM: positiveInteger(40),
  API_RATE_LIMIT_PER_MINUTE: positiveInteger(120),
  CREATE_ROOM_RATE_LIMIT_PER_HOUR: positiveInteger(10),
  MESSAGE_RATE_LIMIT_PER_MINUTE: positiveInteger(60),
  UPLOAD_RATE_LIMIT_PER_MINUTE: positiveInteger(12),
  CONNECTION_RATE_LIMIT_PER_MINUTE: positiveInteger(20),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  tokenSecret: string;
  allowedOrigins: string[];
  trustProxy: boolean;
  serveClient: boolean;
  clientDist: string;
  tempRoot: string;
  sessionTtlMs: number;
  roomTokenTtlMs: number;
  roomEmptyTtlMs: number;
  cleanupIntervalMs: number;
  orphanMaxAgeMs: number;
  roomMaxParticipants: number;
  roomsPerSession: number;
  maxMessagesPerRoom: number;
  maxFileBytes: number;
  maxFilesPerRoom: number;
  apiRateLimitPerMinute: number;
  createRoomRateLimitPerHour: number;
  messageRateLimitPerMinute: number;
  uploadRateLimitPerMinute: number;
  connectionRateLimitPerMinute: number;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = envSchema.parse(environment);
  const insecureSecrets = new Set([
    'development-only-secret-change-me-now',
    'local-docker-secret-change-before-production-123',
    'replace-with-at-least-32-random-characters',
    'replace-with-a-random-secret-of-at-least-32-characters',
  ]);
  if (env.NODE_ENV === 'production' && insecureSecrets.has(env.TOKEN_SECRET)) {
    throw new Error('TOKEN_SECRET debe configurarse de forma segura en produccion');
  }

  return {
    nodeEnv: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    tokenSecret: env.TOKEN_SECRET,
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY,
    serveClient: env.SERVE_CLIENT,
    clientDist: resolve(process.cwd(), env.CLIENT_DIST),
    tempRoot: resolve(env.TEMP_ROOT ?? join(tmpdir(), 'pictochat-mvp')),
    sessionTtlMs: env.SESSION_TTL_MS,
    roomTokenTtlMs: env.ROOM_TOKEN_TTL_MS,
    roomEmptyTtlMs: env.ROOM_EMPTY_TTL_MS,
    cleanupIntervalMs: env.CLEANUP_INTERVAL_MS,
    orphanMaxAgeMs: env.ORPHAN_MAX_AGE_MS,
    roomMaxParticipants: env.ROOM_MAX_PARTICIPANTS,
    roomsPerSession: env.ROOMS_PER_SESSION,
    maxMessagesPerRoom: env.MAX_MESSAGES_PER_ROOM,
    maxFileBytes: env.MAX_FILE_BYTES,
    maxFilesPerRoom: env.MAX_FILES_PER_ROOM,
    apiRateLimitPerMinute: env.API_RATE_LIMIT_PER_MINUTE,
    createRoomRateLimitPerHour: env.CREATE_ROOM_RATE_LIMIT_PER_HOUR,
    messageRateLimitPerMinute: env.MESSAGE_RATE_LIMIT_PER_MINUTE,
    uploadRateLimitPerMinute: env.UPLOAD_RATE_LIMIT_PER_MINUTE,
    connectionRateLimitPerMinute: env.CONNECTION_RATE_LIMIT_PER_MINUTE,
  };
}
