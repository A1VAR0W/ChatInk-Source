import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DisplayMessage } from '../hooks/useRoomSocket';
import { MessageList } from './MessageList';

type TextDisplayMessage = Extract<DisplayMessage, { kind: 'text' }>;

function textMessage(overrides: Partial<TextDisplayMessage> = {}): TextDisplayMessage {
  return {
    id: 'c2a9826c-b0c0-4b86-b4a2-0f144631d421',
    clientId: 'b1351e67-227b-4d6f-a012-8ef9d2f1e6a9',
    roomId: '739c01a9-985a-4eb6-b1e5-1c4a7f6ef2a2',
    sequence: 1,
    createdAt: 1_700_000_000_000,
    sender: { id: 'ada', alias: 'Ada Lovelace' },
    kind: 'text',
    text: 'Hola',
    ...overrides,
  };
}

describe('MessageList', () => {
  it('preserva el texto, la alineación y el contrato responsive de las burbujas', () => {
    const incoming = textMessage({ text: 'I allow callmebot to send me messages' });
    const own = textMessage({
      id: '3cf96191-1d25-4eeb-9a1d-777e3f5d3ab9',
      clientId: 'a09a9ddd-a3ec-4d7b-a2de-3c62a149a2d3',
      sequence: 2,
      createdAt: incoming.createdAt + 1,
      sender: { id: 'lin', alias: 'Lin' },
      text: 'Hola\nSin saltos insertados.',
    });
    const { container } = render(<MessageList messages={[incoming, own]} ownId="lin" roomToken="room-token" onReply={vi.fn()} />);

    const content = Array.from(container.querySelectorAll('.message-text__content'));
    expect(content.map((element) => element.textContent)).toEqual([incoming.text, own.text]);
    expect(container.querySelector('.message:not(.message--own) .message-bubble')).not.toBeNull();
    expect(container.querySelector('.message--own .message-bubble')).not.toBeNull();
    expect(container.querySelector('.message-bubble .message-time')).toBeNull();
    expect(container.querySelectorAll('wbr')).toHaveLength(0);

    const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
    expect(styles).toMatch(/\.message-bubble\s*\{[^}]*width: fit-content;[^}]*max-width: min\(82%, 36rem\)/);
    expect(styles).toMatch(/\.message-bubble::before\s*\{[^}]*clip-path: polygon/);
    expect(styles).toMatch(/\.message-text__content\s*\{[^}]*overflow-wrap: break-word;[^}]*word-break: normal;[^}]*hyphens: none;[^}]*white-space: pre-wrap/);
    expect(styles).not.toMatch(/\.message-text__content\s*\{[^}]*word-break: break-all/);
    expect(styles).not.toMatch(/\.message-text__content\s*\{[^}]*overflow-wrap: anywhere/);
    expect(styles).toMatch(/html, body, #root, ion-app\s*\{[^}]*overflow-x: hidden/);
    expect(styles).toMatch(/\.history\s*\{[^}]*overflow-x: hidden/);
    expect(styles).toMatch(/\.message-list\s*\{[^}]*max-width: 100%;[^}]*overflow-x: hidden/);
    expect(styles).toMatch(/@media \(pointer: coarse\)\s*\{\s*input:not\(\[type="range"\]\):not\(\[type="radio"\]\):not\(\[type="checkbox"\]\), textarea\s*\{ font-size: 16px/);
    expect(styles).toMatch(/input:focus, textarea:focus\s*\{[^}]*outline: none;[^}]*border-color: var\(--primary\)/);
  });

  it('agrupa mensajes consecutivos del mismo autor dentro de la ventana corta', () => {
    const first = textMessage();
    const second = textMessage({ id: '9a2e4c2b-938c-4fdd-9b3b-633af4f4c5b3', clientId: '6d6b3f0a-94fe-4f62-ab4d-0ad95cb4fa8a', sequence: 2, createdAt: first.createdAt + 60_000, text: 'Sigo aquí' });
    const { container } = render(<MessageList messages={[first, second]} ownId="lin" roomToken="room-token" onReply={vi.fn()} />);

    expect(screen.getAllByText('Ada Lovelace')).toHaveLength(1);
    expect(container.querySelectorAll('.message--grouped')).toHaveLength(1);
  });

  it('pliega texto largo y permite responder desde el icono accesible', () => {
    const onReply = vi.fn();
    const message = textMessage({ text: 'mensaje largo '.repeat(70) });
    render(<MessageList messages={[message]} ownId="lin" roomToken="room-token" onReply={onReply} />);

    fireEvent.click(screen.getByRole('button', { name: 'Leer más' }));
    expect(screen.getByRole('button', { name: 'Ver menos' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Responder a Ada Lovelace' }));
    expect(onReply).toHaveBeenCalledWith(message);
  });
});
