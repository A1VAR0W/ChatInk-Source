import { useCallback, useEffect, useRef, useState } from 'react';
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

function replyKindLabel(kind: RoomMessage['kind']): string {
  return kind === 'drawing' ? 'Dibujo' : kind === 'file' ? 'Archivo' : 'Mensaje';
}

export function MessageList({
  messages,
  ownId,
  roomToken,
  onReply,
}: {
  messages: DisplayMessage[];
  ownId: string;
  roomToken: string;
  onReply: (message: RoomMessage) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const messageElements = useRef(new Map<string, HTMLElement>());
  const nearBottom = useRef(true);
  const previousCount = useRef(0);
  const highlightTimer = useRef<number | undefined>(undefined);
  const [unreadCount, setUnreadCount] = useState(0);
  const [highlightedId, setHighlightedId] = useState<string>();

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const root = listRef.current?.parentElement;
    if (root === null || root === undefined) return;
    root.scrollTo({ top: root.scrollHeight, behavior });
    nearBottom.current = true;
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    const root = listRef.current?.parentElement;
    if (root === null || root === undefined) return;
    const updatePosition = () => {
      nearBottom.current = root.scrollHeight - root.scrollTop - root.clientHeight < 96;
      if (nearBottom.current) setUnreadCount(0);
    };
    updatePosition();
    root.addEventListener('scroll', updatePosition, { passive: true });
    return () => root.removeEventListener('scroll', updatePosition);
  }, [messages.length]);

  useEffect(() => {
    const previous = previousCount.current;
    previousCount.current = messages.length;
    if (messages.length === 0) return;
    const latest = messages.at(-1);
    const ownLatest = latest?.sender.id === ownId || latest?.pending === true;
    if (previous === 0 || ownLatest || nearBottom.current) {
      scrollToBottom('auto');
      return;
    }
    if (messages.length > previous) setUnreadCount((count) => count + messages.length - previous);
  }, [messages, ownId, scrollToBottom]);

  useEffect(() => () => {
    if (highlightTimer.current !== undefined) window.clearTimeout(highlightTimer.current);
  }, []);

  const locateOriginal = (messageId: string) => {
    const element = messageElements.current.get(messageId);
    if (element === undefined) return;
    element.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    setHighlightedId(messageId);
    if (highlightTimer.current !== undefined) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightedId(undefined), 1_600);
  };

  if (messages.length === 0) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">✦</span>
        <h2>La sala está en blanco</h2>
        <p>Rompe el hielo con un garabato o un mensaje.</p>
      </div>
    );
  }

  const originalIds = new Set(messages.map((message) => message.id));
  return (
    <div ref={listRef} className="message-list" aria-live="polite" aria-label="Mensajes de la sala">
      {messages.map((message) => {
        const own = message.sender.id === ownId;
        const originalAvailable = message.reply !== undefined && originalIds.has(message.reply.messageId);
        return (
          <article
            key={message.clientId}
            ref={(element) => {
              if (element === null) messageElements.current.delete(message.id);
              else messageElements.current.set(message.id, element);
            }}
            className={`message ${own ? 'message--own' : ''} ${message.failed ? 'message--failed' : ''} ${highlightedId === message.id ? 'message--highlighted' : ''}`}
          >
            <header><strong>{own ? 'Tú' : message.sender.alias}</strong><span>{message.pending ? 'Enviando…' : timeLabel(message.createdAt)}</span></header>
            <div className={`message-bubble message-bubble--${message.kind}`}>
              {message.reply !== undefined && (
                <button
                  type="button"
                  className="message-reply-quote"
                  disabled={!originalAvailable}
                  onClick={() => locateOriginal(message.reply?.messageId ?? '')}
                  aria-label={originalAvailable ? `Ir al ${replyKindLabel(message.reply.kind).toLowerCase()} de ${message.reply.senderAlias}` : `Referencia a ${replyKindLabel(message.reply.kind).toLowerCase()} ya no disponible`}
                >
                  <span>{message.reply.senderAlias} · {replyKindLabel(message.reply.kind)}</span>
                  <strong>{message.reply.preview}</strong>
                </button>
              )}
              <MessageContent message={message} roomToken={roomToken} />
            </div>
            <footer>
              <button type="button" className="message-reply-action" onClick={() => onReply(message)}>Responder</button>
            </footer>
            {message.failed && <small className="error-text">No se pudo enviar.</small>}
          </article>
        );
      })}
      {unreadCount > 0 && (
        <button type="button" className="new-messages-button" onClick={() => scrollToBottom('smooth')}>
          {unreadCount === 1 ? '1 mensaje nuevo' : `${unreadCount} mensajes nuevos`} ↓
        </button>
      )}
    </div>
  );
}
