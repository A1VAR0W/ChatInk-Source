import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AppConfig } from './config.js';

export function testConfig(tempRoot: string, overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 0,
    tokenSecret: 'test-secret-with-at-least-thirty-two-characters',
    allowedOrigins: ['http://localhost:5173'],
    trustProxy: false,
    serveClient: false,
    clientDist: join(process.cwd(), 'missing-client'),
    tempRoot,
    sessionTtlMs: 60_000,
    roomTokenTtlMs: 60_000,
    roomEmptyTtlMs: 300_000,
    cleanupIntervalMs: 60_000,
    orphanMaxAgeMs: 10,
    roomMaxParticipants: 24,
    roomsPerSession: 5,
    maxMessagesPerRoom: 500,
    maxFileBytes: 1024,
    maxFilesPerRoom: 40,
    apiRateLimitPerMinute: 1000,
    createRoomRateLimitPerHour: 10,
    messageRateLimitPerMinute: 60,
    uploadRateLimitPerMinute: 12,
    connectionRateLimitPerMinute: 20,
    ...overrides,
  };
}

export async function tempTestRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pictochat-test-'));
}
