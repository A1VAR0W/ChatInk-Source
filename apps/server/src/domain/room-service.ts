import { randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type {
  FilePayload,
  Participant,
  ReplySnapshot,
  RoomMessage,
  RoomState,
  RoomSummary,
  SendMessageInput,
} from '@pictochat/shared';
import type { AppConfig } from '../config.js';
import type { TempStorage } from '../storage/temp-storage.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

interface StoredFile extends FilePayload {
  path: string;
  createdAt: number;
}

interface RoomParticipant extends Participant {
  connections: Set<string>;
}

interface Room {
  id: string;
  code: string;
  name: string;
  visibility: 'public' | 'private';
  passwordHash?: string;
  creatorSessionId: string;
  createdAt: number;
  expiresAt: number;
  emptySince?: number;
  maxParticipants: number;
  sequence: number;
  participants: Map<string, RoomParticipant>;
  messages: RoomMessage[];
  messageByClientId: Map<string, RoomMessage>;
  files: Map<string, StoredFile>;
}

export interface RoomServiceEvents {
  onMessage?: (roomId: string, message: RoomMessage) => void;
  onParticipants?: (roomId: string, participants: Participant[]) => void;
  onDeleted?: (roomId: string, reason: 'creator' | 'expired' | 'empty' | 'shutdown') => void;
}

export interface CreateRoomInput {
  name: string;
  visibility: 'public' | 'private';
  password?: string;
  maxParticipants?: number;
}

function makeRoomCode(): string {
  const bytes = randomBytes(10);
  return Array.from(bytes, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('');
}

function publicParticipant(participant: RoomParticipant): Participant {
  return {
    id: participant.id,
    alias: participant.alias,
    joinedAt: participant.joinedAt,
    isCreator: participant.isCreator,
  };
}

export class RoomService {
  readonly #rooms = new Map<string, Room>();
  readonly #roomIdByCode = new Map<string, string>();
  #events: RoomServiceEvents = {};

  constructor(
    readonly config: Pick<
      AppConfig,
      | 'roomMaxAgeMs'
      | 'roomEmptyTtlMs'
      | 'roomMaxParticipants'
      | 'roomsPerSession'
      | 'maxMessagesPerRoom'
      | 'maxFilesPerRoom'
    >,
    readonly storage: TempStorage,
    readonly clock: () => number = Date.now,
  ) {}

  setEvents(events: RoomServiceEvents): void {
    this.#events = events;
  }

  async createRoom(sessionId: string, alias: string, input: CreateRoomInput): Promise<RoomSummary> {
    const ownedRooms = Array.from(this.#rooms.values()).filter((room) => room.creatorSessionId === sessionId).length;
    if (ownedRooms >= this.config.roomsPerSession) {
      throw new DomainError('ROOM_LIMIT', 'Has alcanzado el limite de salas activas', 429);
    }

    const now = this.clock();
    const id = randomUUID();
    let code = makeRoomCode();
    while (this.#roomIdByCode.has(code)) code = makeRoomCode();
    const maxParticipants = Math.min(input.maxParticipants ?? this.config.roomMaxParticipants, this.config.roomMaxParticipants);
    const passwordHash = input.password === undefined
      ? undefined
      : await argon2.hash(input.password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });

    const room: Room = {
      id,
      code,
      name: input.name,
      visibility: input.visibility,
      ...(passwordHash === undefined ? {} : { passwordHash }),
      creatorSessionId: sessionId,
      createdAt: now,
      expiresAt: now + this.config.roomMaxAgeMs,
      emptySince: now,
      maxParticipants,
      sequence: 0,
      participants: new Map(),
      messages: [],
      messageByClientId: new Map(),
      files: new Map(),
    };
    this.#rooms.set(id, room);
    this.#roomIdByCode.set(code, id);
    void alias;
    return this.summary(room);
  }

  async authorizeJoin(
    code: string,
    sessionId: string,
    password?: string,
  ): Promise<{ room: RoomSummary; role: 'creator' | 'member' }> {
    const room = this.byCode(code);
    if (room.expiresAt <= this.clock()) {
      await this.deleteRoom(room.id, 'expired');
      throw new DomainError('ROOM_EXPIRED', 'La sala ha caducado', 410);
    }
    const isCreator = room.creatorSessionId === sessionId;
    if (!isCreator && room.passwordHash !== undefined) {
      const valid = password !== undefined && await argon2.verify(room.passwordHash, password);
      if (!valid) throw new DomainError('INVALID_PASSWORD', 'La contrasena no es correcta', 403);
    }
    if (!isCreator && !room.participants.has(sessionId) && room.participants.size >= room.maxParticipants) {
      throw new DomainError('ROOM_FULL', 'La sala esta completa', 409);
    }
    return { room: this.summary(room), role: isCreator ? 'creator' : 'member' };
  }

  connectParticipant(roomId: string, sessionId: string, alias: string, connectionId: string): RoomState {
    const room = this.byId(roomId);
    let participant = room.participants.get(sessionId);
    if (participant === undefined) {
      if (room.participants.size >= room.maxParticipants) throw new DomainError('ROOM_FULL', 'La sala esta completa', 409);
      participant = {
        id: sessionId,
        alias,
        joinedAt: this.clock(),
        isCreator: room.creatorSessionId === sessionId,
        connections: new Set(),
      };
      room.participants.set(sessionId, participant);
    }
    participant.connections.add(connectionId);
    delete room.emptySince;
    const participants = this.participants(room);
    this.#events.onParticipants?.(room.id, participants);
    return {
      room: this.summary(room),
      participants,
      messages: [...room.messages],
      role: room.creatorSessionId === sessionId ? 'creator' : 'member',
    };
  }

  disconnectParticipant(roomId: string, sessionId: string, connectionId: string): void {
    const room = this.#rooms.get(roomId);
    if (room === undefined) return;
    const participant = room.participants.get(sessionId);
    if (participant === undefined) return;
    participant.connections.delete(connectionId);
    if (participant.connections.size === 0) room.participants.delete(sessionId);
    if (room.participants.size === 0) room.emptySince = this.clock();
    this.#events.onParticipants?.(room.id, this.participants(room));
  }

  postMessage(roomId: string, sessionId: string, alias: string, input: SendMessageInput): RoomMessage {
    const room = this.byId(roomId);
    if (!room.participants.has(sessionId)) throw new DomainError('NOT_IN_ROOM', 'Ya no formas parte de la sala', 403);
    const existing = room.messageByClientId.get(input.clientId);
    if (existing !== undefined) return existing;
    const reply = input.replyToId === undefined ? undefined : this.replySnapshot(room, input.replyToId);
    const base = {
      id: randomUUID(),
      clientId: input.clientId,
      roomId,
      sequence: ++room.sequence,
      createdAt: this.clock(),
      sender: { id: sessionId, alias },
      ...(reply === undefined ? {} : { reply }),
    };
    const message: RoomMessage = input.kind === 'text'
      ? { ...base, kind: 'text', text: input.text }
      : { ...base, kind: 'drawing', drawing: input.drawing };
    this.storeMessage(room, message);
    this.#events.onMessage?.(roomId, message);
    return message;
  }

  appendFileMessage(
    roomId: string,
    sessionId: string,
    alias: string,
    clientId: string,
    file: StoredFile,
    replyToId?: string,
  ): RoomMessage {
    const room = this.byId(roomId);
    if (!room.participants.has(sessionId)) throw new DomainError('NOT_IN_ROOM', 'Ya no formas parte de la sala', 403);
    const existing = room.messageByClientId.get(clientId);
    if (existing !== undefined) return existing;
    if (room.files.size >= this.config.maxFilesPerRoom) throw new DomainError('FILE_LIMIT', 'La sala ha alcanzado el limite de archivos', 409);
    room.files.set(file.id, file);
    const reply = replyToId === undefined ? undefined : this.replySnapshot(room, replyToId);
    const message: RoomMessage = {
      id: randomUUID(),
      clientId,
      roomId,
      sequence: ++room.sequence,
      createdAt: this.clock(),
      sender: { id: sessionId, alias },
      ...(reply === undefined ? {} : { reply }),
      kind: 'file',
      file: { id: file.id, name: file.name, mime: file.mime, size: file.size },
    };
    this.storeMessage(room, message);
    this.#events.onMessage?.(roomId, message);
    return message;
  }

  file(roomId: string, fileId: string): StoredFile {
    const file = this.byId(roomId).files.get(fileId);
    if (file === undefined) throw new DomainError('FILE_NOT_FOUND', 'El archivo ya no existe', 404);
    return file;
  }

  isParticipant(roomId: string, sessionId: string): boolean {
    return this.#rooms.get(roomId)?.participants.has(sessionId) ?? false;
  }

  hasRoom(roomId: string): boolean {
    return this.#rooms.has(roomId);
  }

  publicRooms(): RoomSummary[] {
    return Array.from(this.#rooms.values())
      .filter((room) => room.visibility === 'public' && room.expiresAt > this.clock())
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((room) => this.summary(room));
  }

  activeRoomIds(): Set<string> {
    return new Set(this.#rooms.keys());
  }

  async closeByCreator(roomId: string, sessionId: string): Promise<void> {
    const room = this.byId(roomId);
    if (room.creatorSessionId !== sessionId) throw new DomainError('FORBIDDEN', 'Solo quien creo la sala puede cerrarla', 403);
    await this.deleteRoom(roomId, 'creator');
  }

  async sweep(now = this.clock()): Promise<void> {
    const expired: Array<{ id: string; reason: 'expired' | 'empty' }> = [];
    for (const room of this.#rooms.values()) {
      if (room.expiresAt <= now) expired.push({ id: room.id, reason: 'expired' });
      else if (room.emptySince !== undefined && now - room.emptySince >= this.config.roomEmptyTtlMs) {
        expired.push({ id: room.id, reason: 'empty' });
      }
    }
    await Promise.all(expired.map(({ id, reason }) => this.deleteRoom(id, reason)));
  }

  async shutdown(): Promise<void> {
    await Promise.all(Array.from(this.#rooms.keys(), (id) => this.deleteRoom(id, 'shutdown')));
  }

  private storeMessage(room: Room, message: RoomMessage): void {
    room.messages.push(message);
    room.messageByClientId.set(message.clientId, message);
    while (room.messages.length > this.config.maxMessagesPerRoom) {
      const removed = room.messages.shift();
      if (removed !== undefined) room.messageByClientId.delete(removed.clientId);
    }
  }

  private replySnapshot(room: Room, messageId: string): ReplySnapshot {
    const original = room.messages.find((message) => message.id === messageId);
    if (original === undefined) {
      throw new DomainError('REPLY_NOT_FOUND', 'El mensaje al que respondes ya no esta disponible', 404);
    }
    const preview = original.kind === 'text'
      ? original.text.length > 160 ? `${original.text.slice(0, 157)}…` : original.text
      : original.kind === 'drawing'
        ? 'Dibujo'
        : original.file.name.length > 160 ? `${original.file.name.slice(0, 157)}…` : original.file.name;
    return {
      messageId: original.id,
      senderAlias: original.sender.alias,
      kind: original.kind,
      preview,
    };
  }

  private byCode(code: string): Room {
    const roomId = this.#roomIdByCode.get(code);
    if (roomId === undefined) throw new DomainError('ROOM_NOT_FOUND', 'La sala no existe o ya ha caducado', 404);
    return this.byId(roomId);
  }

  private byId(roomId: string): Room {
    const room = this.#rooms.get(roomId);
    if (room === undefined) throw new DomainError('ROOM_NOT_FOUND', 'La sala no existe o ya ha caducado', 404);
    return room;
  }

  private summary(room: Room): RoomSummary {
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      visibility: room.visibility,
      participantCount: room.participants.size,
      maxParticipants: room.maxParticipants,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
    };
  }

  private participants(room: Room): Participant[] {
    return Array.from(room.participants.values(), publicParticipant).sort((left, right) => left.joinedAt - right.joinedAt);
  }

  private async deleteRoom(roomId: string, reason: 'creator' | 'expired' | 'empty' | 'shutdown'): Promise<void> {
    const room = this.#rooms.get(roomId);
    if (room === undefined) return;
    this.#rooms.delete(roomId);
    this.#roomIdByCode.delete(room.code);
    room.messages.length = 0;
    room.messageByClientId.clear();
    room.participants.clear();
    room.files.clear();
    await this.storage.removeRoom(roomId);
    this.#events.onDeleted?.(roomId, reason);
  }
}
