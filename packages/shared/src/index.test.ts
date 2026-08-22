import { describe, expect, it } from 'vitest';
import { aliasSchema, drawingPayloadSchema, drawingStateSchema, latestUpdateManifestSchema, roomCodeSchema, sendMessageSchema, typingStateSchema } from './index.js';

describe('shared contracts', () => {
  it('normalizes and validates aliases', () => {
    expect(aliasSchema.parse('  Ada-7  ')).toBe('Ada-7');
    expect(aliasSchema.safeParse('<script>').success).toBe(false);
  });

  it('normalizes room codes and rejects ambiguous characters', () => {
    expect(roomCodeSchema.parse('abc2345678')).toBe('ABC2345678');
    expect(roomCodeSchema.safeParse('ABCI234567').success).toBe(false);
  });

  it('limits drawing complexity', () => {
    const drawing = { width: 400, height: 300, background: 'light', strokes: [] };
    expect(drawingPayloadSchema.safeParse(drawing).success).toBe(false);
  });

  it('accepts an explicit bucket-fill operation and remains compatible with strokes already sent', () => {
    expect(drawingPayloadSchema.safeParse({
      width: 400,
      height: 300,
      background: 'white',
      strokes: [
        { color: '#6c5ce7', width: 4, tool: 'pencil', points: [{ x: 0.1, y: 0.1, pressure: 0.5 }] },
        { type: 'fill', color: '#e84393', point: { x: 0.5, y: 0.5, pressure: 0.5 } },
      ],
    }).success).toBe(true);
  });

  it('accepts only a UUID reference and a boolean typing state', () => {
    expect(sendMessageSchema.safeParse({
      clientId: 'd9428888-122b-11e1-b85c-61cd3cbb3210', kind: 'text', text: 'Respuesta', replyToId: 'e9428888-122b-11e1-b85c-61cd3cbb3210',
    }).success).toBe(true);
    expect(sendMessageSchema.safeParse({
      clientId: 'd9428888-122b-11e1-b85c-61cd3cbb3210', kind: 'text', text: 'Respuesta', replyToId: 'contenido no fiable',
    }).success).toBe(false);
    expect(typingStateSchema.safeParse({ isTyping: true }).success).toBe(true);
    expect(typingStateSchema.safeParse({ isTyping: 'true' }).success).toBe(false);
    expect(drawingStateSchema.safeParse({ isDrawing: true }).success).toBe(true);
    expect(drawingStateSchema.safeParse({ isDrawing: 'true' }).success).toBe(false);
  });

  it('validates the versioned empty update manifest contract', () => {
    expect(latestUpdateManifestSchema.safeParse({ schemaVersion: 1, channel: 'stable', release: null }).success).toBe(true);
    expect(latestUpdateManifestSchema.safeParse({ schemaVersion: 1, channel: 'preproduction', release: null }).success).toBe(true);
    expect(latestUpdateManifestSchema.safeParse({ schemaVersion: 1, channel: 'stable' }).success).toBe(false);
  });
});
