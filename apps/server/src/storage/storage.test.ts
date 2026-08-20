import { mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRateLimiter } from '../security/rate-limiter.js';
import { tempTestRoot } from '../test-utils.js';
import { detectAllowedMime } from './file-validation.js';
import { safeDownloadName, TempStorage } from './temp-storage.js';

describe('temporary storage and validation', () => {
  let root: string;
  beforeEach(async () => { root = await tempTestRoot(); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('sanitizes malicious names and rejects unrecognized binary data', async () => {
    expect(safeDownloadName('../../<script>.txt')).toBe('_script_.txt');
    const binary = join(root, 'unknown.bin');
    await writeFile(binary, Buffer.from([0, 1, 2, 3, 0, 255]));
    await expect(detectAllowedMime(binary)).resolves.toBeUndefined();
  });

  it('accepts text based on content rather than the claimed extension', async () => {
    const text = join(root, 'fake.exe');
    await writeFile(text, 'contenido de texto valido\n');
    await expect(detectAllowedMime(text)).resolves.toBe('text/plain');
  });

  it('removes orphan room directories after their grace period', async () => {
    const storage = new TempStorage(root);
    const orphan = join(root, 'orphan-room');
    await mkdir(orphan);
    await utimes(orphan, new Date(0), new Date(0));
    await storage.cleanupOrphans(new Set(), 1, Date.now());
    await expect(mkdir(orphan)).resolves.toBeUndefined();
  });

  it('rate limits by key and resets windows', () => {
    const limiter = new MemoryRateLimiter();
    expect(limiter.consume('message:user', 2, 1000, 100)).toBe(true);
    expect(limiter.consume('message:user', 2, 1000, 101)).toBe(true);
    expect(limiter.consume('message:user', 2, 1000, 102)).toBe(false);
    expect(limiter.consume('message:user', 2, 1000, 1101)).toBe(true);
  });
});
