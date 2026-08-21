import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DrawingPayload } from '@pictochat/shared';
import { RoomService } from './room-service.js';
import { TempStorage } from '../storage/temp-storage.js';
import { tempTestRoot, testConfig } from '../test-utils.js';

const drawing: DrawingPayload = {
  width: 400,
  height: 220,
  background: 'light',
  strokes: [{ color: '#17162b', width: 5, tool: 'pencil', points: [{ x: 0.1, y: 0.1, pressure: 0.5 }] }],
};

describe('RoomService lifecycle', () => {
  let root: string;
  let now: number;
  let storage: TempStorage;
  let rooms: RoomService;

  beforeEach(async () => {
    root = await tempTestRoot();
    now = 1_700_000_000_000;
    storage = new TempStorage(root);
    await storage.initialize();
    rooms = new RoomService(testConfig(root, { roomEmptyTtlMs: 1_000, roomMaxAgeMs: 5_000 }), storage, () => now);
  });

  afterEach(async () => {
    await rooms.shutdown();
    await rm(root, { recursive: true, force: true });
  });

  it('creates, joins and closes rooms with creator authorization', async () => {
    const room = await rooms.createRoom('creator', 'Ada', { name: 'Ideas', visibility: 'public' });
    expect((await rooms.authorizeJoin(room.code, 'member')).role).toBe('member');
    rooms.connectParticipant(room.id, 'creator', 'Ada', 'socket-a');
    rooms.connectParticipant(room.id, 'member', 'Lin', 'socket-b');
    await expect(rooms.closeByCreator(room.id, 'member')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await rooms.closeByCreator(room.id, 'creator');
    expect(rooms.hasRoom(room.id)).toBe(false);
  });

  it('protects private rooms with Argon2id hashes', async () => {
    const room = await rooms.createRoom('creator', 'Ada', { name: 'Privada', visibility: 'private', password: 'very-secret' });
    await expect(rooms.authorizeJoin(room.code, 'member', 'wrong-pass')).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
    await expect(rooms.authorizeJoin(room.code, 'member', 'very-secret')).resolves.toMatchObject({ role: 'member' });
  });

  it('orders messages and deduplicates client identifiers after reconnection', async () => {
    const room = await rooms.createRoom('creator', 'Ada', { name: 'Orden', visibility: 'public' });
    rooms.connectParticipant(room.id, 'creator', 'Ada', 'socket-a');
    const clientId = 'd9428888-122b-11e1-b85c-61cd3cbb3210';
    const first = rooms.postMessage(room.id, 'creator', 'Ada', { clientId, kind: 'text', text: 'Hola' });
    const duplicate = rooms.postMessage(room.id, 'creator', 'Ada', { clientId, kind: 'text', text: 'Hola' });
    const second = rooms.postMessage(room.id, 'creator', 'Ada', {
      clientId: 'e9428888-122b-11e1-b85c-61cd3cbb3210', kind: 'drawing', drawing,
    });
    expect(duplicate.id).toBe(first.id);
    expect([first.sequence, second.sequence]).toEqual([1, 2]);
  });

  it('creates an authoritative compact snapshot for replies in the same room', async () => {
    const room = await rooms.createRoom('creator', 'Ada', { name: 'Respuestas', visibility: 'public' });
    rooms.connectParticipant(room.id, 'creator', 'Ada', 'socket-a');
    const original = rooms.postMessage(room.id, 'creator', 'Ada', {
      clientId: 'd9428888-122b-11e1-b85c-61cd3cbb3211', kind: 'text', text: 'Un mensaje original que el servidor resume de forma segura.',
    });
    if (original.kind !== 'text') throw new Error('Expected a text message');
    const reply = rooms.postMessage(room.id, 'creator', 'Ada', {
      clientId: 'd9428888-122b-11e1-b85c-61cd3cbb3212', kind: 'text', text: 'Respuesta', replyToId: original.id,
    });
    expect(reply.reply).toEqual({ messageId: original.id, senderAlias: 'Ada', kind: 'text', preview: original.text });
    expect(() => rooms.postMessage(room.id, 'creator', 'Ada', {
      clientId: 'd9428888-122b-11e1-b85c-61cd3cbb3213', kind: 'text', text: 'No existe', replyToId: 'e9428888-122b-11e1-b85c-61cd3cbb3213',
    })).toThrow(/no esta disponible/);
  });

  it('expires empty and maximum-age rooms and removes their files', async () => {
    const room = await rooms.createRoom('creator', 'Ada', { name: 'Caduca', visibility: 'public' });
    const roomDirectory = join(root, room.id);
    await mkdir(roomDirectory, { recursive: true });
    await writeFile(join(roomDirectory, 'orphan.bin'), 'temporary');
    now += 1_001;
    await rooms.sweep(now);
    expect(rooms.hasRoom(room.id)).toBe(false);
    await expect(access(roomDirectory)).rejects.toThrow();

    const oldRoom = await rooms.createRoom('creator-2', 'Lin', { name: 'Max age', visibility: 'private' });
    rooms.connectParticipant(oldRoom.id, 'creator-2', 'Lin', 'socket-z');
    now += 5_001;
    await rooms.sweep(now);
    expect(rooms.hasRoom(oldRoom.id)).toBe(false);
  });
});
