import { describe, expect, it } from 'vitest';
import { aliasSchema, drawingPayloadSchema, roomCodeSchema } from './index.js';

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
});
