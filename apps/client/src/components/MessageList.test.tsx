import { fireEvent, render, screen } from '@testing-library/react';
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
