import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { RoomMessage } from '@pictochat/shared';
import type { DisplayMessage } from '../hooks/useRoomSocket';
import { Avatar } from './Avatar';
import { DrawingPreview } from './DrawingPreview';
import { FileCard } from './FileCard';
import { ReplyIcon } from './Icons';

const GROUP_WINDOW_MS = 3 * 60 * 1_000;
const EXPAND_TEXT_AT = 640;
const REPLY_SWIPE_DISTANCE = 72;

function timeLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function LongText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = text.length > EXPAND_TEXT_AT;
  return (
    <div className="message-text">
      <p className={canExpand && !expanded ? 'message-text__content message-text__content--collapsed' : 'message-text__content'}>{text}</p>
      {canExpand && <button type="button" className="message-text__toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? 'Ver menos' : 'Leer más'}</button>}
    </div>
  );
}

function MessageContent({ message, roomToken }: { message: RoomMessage; roomToken: string }) {
  if (message.kind === 'text') return <LongText text={message.text} />;
  if (message.kind === 'drawing') return <DrawingPreview drawing={message.drawing} />;
  return <FileCard file={message.file} roomId={message.roomId} roomToken={roomToken} />;
}

function replyKindLabel(kind: RoomMessage['kind']): string {
  return kind === 'drawing' ? 'Dibujo' : kind === 'file' ? 'Archivo' : 'Mensaje';
}

function continuesGroup(previous: DisplayMessage | undefined, message: DisplayMessage): boolean {
  return previous !== undefined
    && previous.sender.id === message.sender.id
    && message.createdAt >= previous.createdAt
    && message.createdAt - previous.createdAt <= GROUP_WINDOW_MS;
}

type SwipeState = {
  message: RoomMessage;
  pointerId: number;
  startX: number;
  startY: number;
  target: HTMLElement;
};

type MessageGroup = {
  senderId: string;
  senderAlias: string;
  messages: DisplayMessage[];
};

function groupMessages(messages: DisplayMessage[]): MessageGroup[] {
  return messages.reduce<MessageGroup[]>((groups, message) => {
    const current = groups.at(-1);
    const previous = current?.messages.at(-1);
    if (current !== undefined && continuesGroup(previous, message)) {
      current.messages.push(message);
      return groups;
    }
    groups.push({ senderId: message.sender.id, senderAlias: message.sender.alias, messages: [message] });
    return groups;
  }, []);
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
  const swipe = useRef<SwipeState | undefined>(undefined);
  const [unreadCount, setUnreadCount] = useState(0);
  const [highlightedId, setHighlightedId] = useState<string>();

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const root = listRef.current?.parentElement;
    if (root === null || root === undefined) return;
    root.scrollTo?.({ top: root.scrollHeight, behavior });
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

  const resetSwipe = (target: HTMLElement) => {
    target.classList.remove('message-swipe-target--dragging');
    target.style.removeProperty('--reply-swipe-offset');
  };

  const beginSwipe = (event: ReactPointerEvent<HTMLElement>, message: RoomMessage) => {
    if (event.pointerType === 'mouse') return;
    if (event.target instanceof Element && event.target.closest('button, a, input')) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Los eventos sintéticos de pruebas no son punteros activos, pero el
      // gesto sigue siendo válido y los navegadores reales sí lo capturan.
    }
    swipe.current = {
      message,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target: event.currentTarget,
    };
  };

  const moveSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    const activeSwipe = swipe.current;
    if (activeSwipe === undefined || activeSwipe.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - activeSwipe.startX;
    const deltaY = event.clientY - activeSwipe.startY;
    if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
    if (Math.abs(deltaX) > 12) event.preventDefault();
    activeSwipe.target.classList.add('message-swipe-target--dragging');
    activeSwipe.target.style.setProperty('--reply-swipe-offset', `${Math.sign(deltaX) * Math.min(Math.abs(deltaX), REPLY_SWIPE_DISTANCE)}px`);
  };

  const finishSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    const activeSwipe = swipe.current;
    if (activeSwipe === undefined || activeSwipe.pointerId !== event.pointerId) return;
    swipe.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const deltaX = event.clientX - activeSwipe.startX;
    const deltaY = event.clientY - activeSwipe.startY;
    const reply = Math.abs(deltaX) >= REPLY_SWIPE_DISTANCE && Math.abs(deltaX) > Math.abs(deltaY);
    resetSwipe(activeSwipe.target);
    if (reply) onReply(activeSwipe.message);
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
  const messageGroups = groupMessages(messages);
  return (
    <div ref={listRef} className="message-list" aria-live="polite" aria-label="Mensajes de la sala">
      {messageGroups.map((group) => {
        const own = group.senderId === ownId;
        const first = group.messages[0];
        if (first === undefined) return null;
        return (
          <section key={first.clientId} className={`message-group ${own ? 'message-group--own' : ''}`}>
            <header className="message-header"><Avatar alias={group.senderAlias} className="avatar--message" label={false} /><div><strong>{own ? 'Tú' : group.senderAlias}</strong><span>{first.pending ? 'Enviando…' : timeLabel(first.createdAt)}</span></div></header>
            <div className="message-group__items">
              {group.messages.map((message, index) => {
                const grouped = index > 0;
                const originalAvailable = message.reply !== undefined && originalIds.has(message.reply.messageId);
                const replyButton = (
                  <button type="button" className="message-reply-action" onClick={() => onReply(message)} aria-label={`Responder a ${own ? 'tu mensaje' : message.sender.alias}`} title="Responder">
                    <ReplyIcon className={own ? '' : 'message-reply-action__incoming'} />
                  </button>
                );
                return (
                  <article
                    key={message.clientId}
                    ref={(element) => {
                      if (element === null) messageElements.current.delete(message.id);
                      else messageElements.current.set(message.id, element);
                    }}
                    className={`message ${own ? 'message--own' : ''} ${grouped ? 'message--grouped' : 'message--group-start'} ${index === group.messages.length - 1 ? 'message--group-last' : ''} ${message.failed ? 'message--failed' : ''} ${highlightedId === message.id ? 'message--highlighted' : ''}`}
                  >
                    <div
                      className={`message-swipe-target ${own ? 'message-swipe-target--own' : ''}`}
                      onPointerDown={(event) => beginSwipe(event, message)}
                      onPointerMove={moveSwipe}
                      onPointerUp={finishSwipe}
                      onPointerCancel={finishSwipe}
                    >
                      {own && replyButton}
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
                        <time className="message-time">{message.pending ? 'Enviando…' : timeLabel(message.createdAt)}</time>
                      </div>
                      {!own && replyButton}
                    </div>
                    {message.failed && <small className="error-text">No se pudo enviar.</small>}
                  </article>
                );
              })}
            </div>
          </section>
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
