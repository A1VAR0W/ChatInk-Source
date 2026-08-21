import { z } from 'zod';

export const APP_NAME = 'ChatInk';
export const ROOM_CODE_LENGTH = 10;
export const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const stableVersionSchema = z.string().regex(stableVersionPattern, 'La versión debe usar SemVer estable MAJOR.MINOR.PATCH');

const updatePlatformSchema = z.object({
  downloadUrl: z.url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  size: z.number().int().nonnegative(),
}).strict();

export const updateReleaseSchema = z.object({
  tag: z.string().regex(/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
  version: stableVersionSchema,
  versionCode: z.number().int().positive(),
  publishedAt: z.string().datetime({ offset: true }),
  minimumSupportedVersion: stableVersionSchema.nullable(),
  mandatory: z.boolean(),
  notes: z.array(z.string().trim().min(1).max(1_000)).max(20),
  releaseUrl: z.url(),
  platforms: z.object({
    android: updatePlatformSchema,
    ios: updatePlatformSchema.extend({ sourceUrl: z.url() }),
  }).strict(),
}).strict();

export const latestUpdateManifestSchema = z.object({
  schemaVersion: z.literal(1),
  channel: z.literal('stable'),
  release: updateReleaseSchema.nullable(),
}).strict();

export type UpdateRelease = z.infer<typeof updateReleaseSchema>;
export type LatestUpdateManifest = z.infer<typeof latestUpdateManifestSchema>;

export const aliasSchema = z
  .string()
  .trim()
  .min(2, 'El alias debe tener al menos 2 caracteres')
  .max(24, 'El alias no puede superar 24 caracteres')
  .regex(/^[\p{L}\p{N} _.-]+$/u, 'Usa letras, numeros, espacios, punto, guion o guion bajo');

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{10}$/, 'El codigo de sala no es valido');

export const createRoomSchema = z
  .object({
    name: z.string().trim().min(2).max(48),
    visibility: z.enum(['public', 'private']),
    password: z.string().min(8).max(128).optional(),
    maxParticipants: z.number().int().min(2).max(100).optional(),
  })
  .superRefine((room, context) => {
    if (room.visibility === 'private' && room.password !== undefined && room.password.length < 8) {
      context.addIssue({ code: 'custom', path: ['password'], message: 'La contrasena debe tener al menos 8 caracteres' });
    }
    if (room.visibility === 'public' && room.password !== undefined) {
      context.addIssue({ code: 'custom', path: ['password'], message: 'Una sala publica no puede tener contrasena' });
    }
  });

export const joinRoomSchema = z.object({
  password: z.string().max(128).optional(),
});

export const pointSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  pressure: z.number().finite().min(0).max(1),
});

export const strokeSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().finite().min(1).max(48),
  tool: z.enum(['pencil', 'eraser']),
  points: z.array(pointSchema).min(1).max(4000),
});

export const drawingPayloadSchema = z.object({
  width: z.number().int().min(100).max(2400),
  height: z.number().int().min(80).max(1600),
  // light/dark remain readable only for drawings already in a live room before
  // the white-canvas migration. New drawings use white or the optional mark.
  background: z.enum(['white', 'logo', 'light', 'dark']),
  strokes: z.array(strokeSchema).min(1).max(250),
});

export type DrawingPayload = z.infer<typeof drawingPayloadSchema>;
export type DrawingStroke = z.infer<typeof strokeSchema>;

export const textMessageInputSchema = z.object({
  clientId: z.uuid(),
  kind: z.literal('text'),
  text: z.string().trim().min(1),
});

export const drawingMessageInputSchema = z.object({
  clientId: z.uuid(),
  kind: z.literal('drawing'),
  drawing: drawingPayloadSchema,
});

export const replyToIdSchema = z.uuid();

export const sendMessageSchema = z.discriminatedUnion('kind', [
  textMessageInputSchema.extend({ replyToId: replyToIdSchema.optional() }),
  drawingMessageInputSchema.extend({ replyToId: replyToIdSchema.optional() }),
]);
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const typingStateSchema = z.object({ isTyping: z.boolean() });
export type TypingStateInput = z.infer<typeof typingStateSchema>;

export const closeRoomSchema = z.object({ reason: z.string().max(100).optional() });

export interface SessionResponse {
  sessionId: string;
  alias: string;
  token: string;
  expiresAt: number;
}

export interface RoomSummary {
  id: string;
  code: string;
  name: string;
  visibility: 'public' | 'private';
  participantCount: number;
  maxParticipants: number;
  createdAt: number;
  expiresAt: number;
}

export interface RoomAccessResponse {
  room: RoomSummary;
  roomToken: string;
  role: 'creator' | 'member';
}

export interface Participant {
  id: string;
  alias: string;
  joinedAt: number;
  isCreator: boolean;
}

export interface FilePayload {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export interface ReplySnapshot {
  messageId: string;
  senderAlias: string;
  kind: 'text' | 'drawing' | 'file';
  preview: string;
}

type RoomMessageBase = {
  id: string;
  clientId: string;
  roomId: string;
  sequence: number;
  createdAt: number;
  sender: { id: string; alias: string };
  reply?: ReplySnapshot;
} & (
  | { kind: 'text'; text: string }
  | { kind: 'drawing'; drawing: DrawingPayload }
  | { kind: 'file'; file: FilePayload }
);

export type RoomMessage = RoomMessageBase;

export interface RoomState {
  room: RoomSummary;
  participants: Participant[];
  messages: RoomMessage[];
  role: 'creator' | 'member';
}

export interface ApiError {
  error: string;
  code: string;
  details?: Record<string, string[]>;
}

export interface UploadResponse {
  message: RoomMessage;
}

export interface TypingParticipant {
  id: string;
  alias: string;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'room:participants': (participants: Participant[]) => void;
  'message:new': (message: RoomMessage) => void;
  'room:typing': (participants: TypingParticipant[]) => void;
  'room:closed': (payload: { reason: 'creator' | 'expired' | 'empty' | 'shutdown' }) => void;
  'server:error': (payload: { code: string; message: string; clientId?: string }) => void;
}

export interface ClientToServerEvents {
  'message:send': (message: SendMessageInput, acknowledge: (result: SocketAcknowledgement) => void) => void;
  'typing:set': (input: TypingStateInput) => void;
  'room:close': (acknowledge: (result: SocketAcknowledgement) => void) => void;
}

export type InterServerEvents = Record<never, never>;

export interface SocketData {
  sessionId: string;
  alias: string;
  roomId: string;
  role: 'creator' | 'member';
}

export type SocketAcknowledgement =
  | { ok: true; messageId?: string }
  | { ok: false; code: string; message: string };

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
}
