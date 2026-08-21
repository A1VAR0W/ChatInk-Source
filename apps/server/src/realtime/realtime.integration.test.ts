import { rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type {
  ClientToServerEvents,
  RoomAccessResponse,
  RoomMessage,
  RoomState,
  ServerToClientEvents,
  SessionResponse,
  TypingParticipant,
} from '@pictochat/shared';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApplication, type PictoApplication } from '../app.js';
import { tempTestRoot, testConfig } from '../test-utils.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

async function connectClient(url: string, session: SessionResponse, access: RoomAccessResponse): Promise<{ socket: ClientSocket; state: RoomState }> {
  const socket: ClientSocket = createClient(url, {
    autoConnect: false,
    transports: ['websocket'],
    auth: { sessionToken: session.token, roomToken: access.roomToken },
  });
  const statePromise = new Promise<RoomState>((resolve, reject) => {
    socket.once('room:state', resolve);
    socket.once('connect_error', reject);
  });
  socket.connect();
  return { socket, state: await statePromise };
}

function nextMessage(socket: ClientSocket): Promise<RoomMessage> {
  return new Promise((resolve) => socket.once('message:new', resolve));
}

function nextTyping(socket: ClientSocket): Promise<TypingParticipant[]> {
  return new Promise((resolve) => socket.once('room:typing', resolve));
}

function multipart(clientId: string, filename: string, bytes: Buffer, type = 'application/octet-stream') {
  const boundary = `----doodledrop-${Date.now()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="clientId"\r\n\r\n${clientId}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, bytes, tail]), contentType: `multipart/form-data; boundary=${boundary}` };
}

describe('two-client realtime flow', () => {
  let root: string;
  let application: PictoApplication;
  let url: string;
  const sockets: ClientSocket[] = [];

  beforeEach(async () => {
    root = await tempTestRoot();
    application = await buildApplication(testConfig(root));
    await application.app.listen({ host: '127.0.0.1', port: 0 });
    const address = application.app.server.address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    sockets.forEach((socket) => socket.disconnect());
    sockets.length = 0;
    await application.shutdown();
    await rm(root, { recursive: true, force: true });
  });

  async function session(alias: string): Promise<SessionResponse> {
    const response = await application.app.inject({ method: 'POST', url: '/api/sessions', payload: { alias } });
    expect(response.statusCode).toBe(200);
    return response.json<SessionResponse>();
  }

  it('exchanges ordered text and drawings without duplicates, then closes the room', async () => {
    const ada = await session('Ada');
    const lin = await session('Lin');
    const createdResponse = await application.app.inject({ method: 'POST', url: '/api/rooms', headers: { authorization: `Bearer ${ada.token}` }, payload: { name: 'Prueba', visibility: 'public' } });
    const creatorAccess = createdResponse.json<RoomAccessResponse>();
    const joinedResponse = await application.app.inject({ method: 'POST', url: `/api/rooms/${creatorAccess.room.code}/join`, headers: { authorization: `Bearer ${lin.token}` }, payload: {} });
    const memberAccess = joinedResponse.json<RoomAccessResponse>();
    const creator = await connectClient(url, ada, creatorAccess);
    const member = await connectClient(url, lin, memberAccess);
    sockets.push(creator.socket, member.socket);
    expect(member.state.participants).toHaveLength(2);

    const clientId = crypto.randomUUID();
    const received = nextMessage(member.socket);
    const ack = await new Promise<{ ok: boolean; messageId?: string }>((resolve) => creator.socket.emit('message:send', { clientId, kind: 'text', text: 'Hola en tiempo real' }, resolve));
    const first = await received;
    expect(ack.ok).toBe(true);
    expect(first).toMatchObject({ sequence: 1, kind: 'text', text: 'Hola en tiempo real' });

    const duplicateAck = await new Promise<{ ok: boolean; messageId?: string }>((resolve) => creator.socket.emit('message:send', { clientId, kind: 'text', text: 'Hola en tiempo real' }, resolve));
    expect(duplicateAck.messageId).toBe(first.id);

    const drawingReceived = nextMessage(creator.socket);
    member.socket.emit('message:send', {
      clientId: crypto.randomUUID(), kind: 'drawing', drawing: {
        width: 400, height: 220, background: 'light',
        strokes: [{ color: '#6c5ce7', width: 4, tool: 'pencil', points: [{ x: 0.2, y: 0.3, pressure: 0.5 }] }],
      },
    }, () => undefined);
    await expect(drawingReceived).resolves.toMatchObject({ sequence: 2, kind: 'drawing' });

    const closed = new Promise((resolve) => member.socket.once('room:closed', resolve));
    creator.socket.emit('room:close', () => undefined);
    await expect(closed).resolves.toMatchObject({ reason: 'creator' });
    expect(application.rooms.hasRoom(creatorAccess.room.id)).toBe(false);
  });

  it('authorizes streaming upload/download, sanitizes paths and rejects oversized files', async () => {
    const ada = await session('Ada');
    const created = (await application.app.inject({ method: 'POST', url: '/api/rooms', headers: { authorization: `Bearer ${ada.token}` }, payload: { name: 'Archivos', visibility: 'private', password: 'correct-password' } })).json<RoomAccessResponse>();
    const connected = await connectClient(url, ada, created);
    sockets.push(connected.socket);
    const clientId = crypto.randomUUID();
    const body = multipart(clientId, '../../notes.txt', Buffer.from('archivo temporal seguro\n'), 'text/plain');
    const upload = await application.app.inject({
      method: 'POST', url: `/api/rooms/${created.room.id}/files`,
      headers: { authorization: `Bearer ${created.roomToken}`, 'x-session-token': ada.token, 'content-type': body.contentType },
      payload: body.payload,
    });
    expect(upload.statusCode).toBe(201);
    const message = upload.json<{ message: RoomMessage }>().message;
    expect(message).toMatchObject({ kind: 'file', file: { name: 'notes.txt', mime: 'text/plain' } });
    if (message.kind !== 'file') throw new Error('Expected file message');

    const unauthorized = await application.app.inject({ method: 'GET', url: `/api/rooms/${created.room.id}/files/${message.file.id}` });
    expect(unauthorized.statusCode).toBe(401);
    const download = await application.app.inject({ method: 'GET', url: `/api/rooms/${created.room.id}/files/${message.file.id}`, headers: { authorization: `Bearer ${created.roomToken}` } });
    expect(download.statusCode).toBe(200);
    expect(download.body).toContain('archivo temporal seguro');

    const tooLargeBody = multipart(crypto.randomUUID(), 'large.txt', Buffer.alloc(2048, 65), 'text/plain');
    const tooLarge = await application.app.inject({
      method: 'POST', url: `/api/rooms/${created.room.id}/files`,
      headers: { authorization: `Bearer ${created.roomToken}`, 'x-session-token': ada.token, 'content-type': tooLargeBody.contentType },
      payload: tooLargeBody.payload,
    });
    expect(tooLarge.statusCode).toBe(413);
  });

  it('broadcasts deduplicated typing, clears it on send and disconnect', async () => {
    const ada = await session('Ada');
    const lin = await session('Lin');
    const created = (await application.app.inject({ method: 'POST', url: '/api/rooms', headers: { authorization: `Bearer ${ada.token}` }, payload: { name: 'Typing', visibility: 'public' } })).json<RoomAccessResponse>();
    const joined = (await application.app.inject({ method: 'POST', url: `/api/rooms/${created.room.code}/join`, headers: { authorization: `Bearer ${lin.token}` }, payload: {} })).json<RoomAccessResponse>();
    const creator = await connectClient(url, ada, created);
    const secondCreatorTab = await connectClient(url, ada, created);
    const member = await connectClient(url, lin, joined);
    sockets.push(creator.socket, secondCreatorTab.socket, member.socket);

    const firstTyping = nextTyping(member.socket);
    creator.socket.emit('typing:set', { isTyping: true });
    await expect(firstTyping).resolves.toEqual([{ id: ada.sessionId, alias: 'Ada' }]);

    let repeatedBroadcast = false;
    member.socket.once('room:typing', () => { repeatedBroadcast = true; });
    secondCreatorTab.socket.emit('typing:set', { isTyping: true });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(repeatedBroadcast).toBe(false);

    const stoppedOnSend = nextTyping(member.socket);
    creator.socket.emit('message:send', { clientId: crypto.randomUUID(), kind: 'text', text: 'Mientras escribía' }, () => undefined);
    secondCreatorTab.socket.emit('typing:set', { isTyping: false });
    await expect(stoppedOnSend).resolves.toEqual([]);

    const typingBeforeDisconnect = nextTyping(member.socket);
    creator.socket.emit('typing:set', { isTyping: true });
    await expect(typingBeforeDisconnect).resolves.toEqual([{ id: ada.sessionId, alias: 'Ada' }]);
    const stoppedOnDisconnect = nextTyping(member.socket);
    creator.socket.disconnect();
    await expect(stoppedOnDisconnect).resolves.toEqual([]);
  });

  it('expires typing presence defensively after the server timeout', async () => {
    const ada = await session('Ada');
    const lin = await session('Lin');
    const created = (await application.app.inject({ method: 'POST', url: '/api/rooms', headers: { authorization: `Bearer ${ada.token}` }, payload: { name: 'Timeout', visibility: 'public' } })).json<RoomAccessResponse>();
    const joined = (await application.app.inject({ method: 'POST', url: `/api/rooms/${created.room.code}/join`, headers: { authorization: `Bearer ${lin.token}` }, payload: {} })).json<RoomAccessResponse>();
    const creator = await connectClient(url, ada, created);
    const member = await connectClient(url, lin, joined);
    sockets.push(creator.socket, member.socket);
    const started = nextTyping(member.socket);
    creator.socket.emit('typing:set', { isTyping: true });
    await started;
    await expect(nextTyping(member.socket)).resolves.toEqual([]);
  }, 7_000);
});
