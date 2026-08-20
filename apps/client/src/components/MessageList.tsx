import { useEffect, useRef } from 'react';
import type { RoomMessage } from '@pictochat/shared';
import type { DisplayMessage } from '../hooks/useRoomSocket';
import { DrawingPreview } from './DrawingPreview';
import { FileCard } from './FileCard';

function timeLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function MessageContent({ message, roomToken }: { message: RoomMessage; roomToken: string }) {
  if (message.kind === 'text') return <p className="message-text">{message.text}</p>;
  if (message.kind === 'drawing') return <DrawingPreview drawing={message.drawing} />;
  return <FileCard file={message.file} roomId={message.roomId} roomToken={roomToken} />;
}

export function MessageList({ messages, ownId, roomToken }: { messages: DisplayMessage[]; ownId: string; roomToken: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">✦</span>
        <h2>La sala está en blanco</h2>
        <p>Rompe el hielo con un garabato o un mensaje.</p>
      </div>
    );
  }

  return (
    <div className="message-list" aria-live="polite" aria-label="Mensajes de la sala">
      {messages.map((message) => {
        const own = message.sender.id === ownId;
        return (
          <article key={message.clientId} className={`message ${own ? 'message--own' : ''} ${message.failed ? 'message--failed' : ''}`}>
            <header><strong>{own ? 'Tú' : message.sender.alias}</strong><span>{message.pending ? 'Enviando…' : timeLabel(message.createdAt)}</span></header>
            <div className={`message-bubble message-bubble--${message.kind}`}>
              <MessageContent message={message} roomToken={roomToken} />
            </div>
            {message.failed && <small className="error-text">No se pudo enviar.</small>}
          </article>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
