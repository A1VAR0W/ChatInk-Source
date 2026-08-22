import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import type { DrawingPayload, RoomMessage } from '@pictochat/shared';
import { DrawingCanvas } from './DrawingCanvas';

const EMOJIS = ['👋', '✨', '😂', '❤️', '👍', '🎨', '🔥', '🤔'];

function messageLabel(message: RoomMessage): string {
  if (message.kind === 'text') return message.text.length > 100 ? `${message.text.slice(0, 97)}…` : message.text;
  return message.kind === 'drawing' ? 'Dibujo' : message.file.name;
}

function usesCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

export function ChatComposer({
  disabled,
  mode,
  replyTo,
  onText,
  onDrawing,
  onFiles,
  onCancelReply,
  onTypingChange,
  onDrawingActivityChange,
  onModeChange,
}: {
  disabled: boolean;
  mode: 'text' | 'drawing';
  replyTo?: RoomMessage;
  onText: (text: string, replyToId?: string) => void;
  onDrawing: (drawing: DrawingPayload, replyToId?: string) => void;
  onFiles: (files: FileList, replyToId?: string) => void;
  onCancelReply: () => void;
  onTypingChange: (isTyping: boolean) => void;
  onDrawingActivityChange: (isDrawing: boolean) => void;
  onModeChange: (mode: 'text' | 'drawing') => void;
}) {
  const [text, setText] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingActive = useRef(false);
  const handleDrawingDirty = useCallback((_dirty: boolean) => undefined, []);

  const stopTyping = useCallback(() => {
    if (!typingActive.current) return;
    typingActive.current = false;
    onTypingChange(false);
  }, [onTypingChange]);

  useEffect(() => {
    const shouldType = mode === 'text' && isFocused && !disabled && text.trim().length > 0;
    if (!shouldType) {
      stopTyping();
      return;
    }
    if (!typingActive.current) {
      typingActive.current = true;
      onTypingChange(true);
    }
    const keepAlive = window.setInterval(() => onTypingChange(true), 2_000);
    return () => window.clearInterval(keepAlive);
  }, [disabled, isFocused, mode, onTypingChange, stopTyping, text]);

  useEffect(() => () => stopTyping(), [stopTyping]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (mode !== 'text' || textarea === null) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 144 ? 'auto' : 'hidden';
  }, [mode, text]);

  useEffect(() => {
    if (replyTo === undefined || mode !== 'text') return;
    const frame = window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [mode, replyTo]);

  const submit = () => {
    const value = text.trim();
    if (value.length === 0 || disabled || isComposing) return;
    stopTyping();
    onText(value, replyTo?.id);
    setText('');
    setShowEmojis(false);
    if (replyTo !== undefined) onCancelReply();
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || isComposing || usesCoarsePointer()) return;
    event.preventDefault();
    submit();
  };
  const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files !== null && event.target.files.length > 0) {
      stopTyping();
      onFiles(event.target.files, replyTo?.id);
      if (replyTo !== undefined) onCancelReply();
    }
    event.target.value = '';
  };
  const selectMode = (nextMode: 'text' | 'drawing') => {
    if (nextMode === mode) return;
    setShowEmojis(false);
    onModeChange(nextMode);
    if (nextMode === 'drawing') {
      setIsFocused(false);
      textareaRef.current?.blur();
    }
  };
  const appendEmoji = (emoji: string) => {
    setText((value) => `${value}${emoji}`);
    if (!usesCoarsePointer()) requestAnimationFrame(() => textareaRef.current?.focus());
  };
  const sendDrawing = (drawing: DrawingPayload) => {
    onDrawing(drawing, replyTo?.id);
    if (replyTo !== undefined) onCancelReply();
  };

  return (
    <section className={`composer composer--${mode}`} aria-label="Crear mensaje">
      {replyTo !== undefined && (
        <div className="reply-context">
          <div><span>Respondiendo a <strong>{replyTo.sender.alias}</strong></span><p>{messageLabel(replyTo)}</p></div>
          <button type="button" className="icon-button" onClick={onCancelReply} aria-label="Cancelar respuesta">×</button>
        </div>
      )}
      <div className="mode-tabs" role="tablist" aria-label="Tipo de mensaje">
        <button type="button" role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? 'active' : ''} onClick={() => selectMode('text')}>Texto</button>
        <button type="button" role="tab" aria-selected={mode === 'drawing'} className={mode === 'drawing' ? 'active' : ''} onClick={() => selectMode('drawing')}>Dibujo</button>
      </div>
      <div className="text-composer" hidden={mode !== 'text'}>
        {showEmojis && <div className="emoji-picker" aria-label="Emojis">{EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => appendEmoji(emoji)} aria-label={`Añadir ${emoji}`}>{emoji}</button>)}</div>}
        <div className="text-row">
          <button type="button" className="icon-button" onClick={() => setShowEmojis((value) => !value)} aria-label="Elegir emoji" aria-expanded={showEmojis}>☺</button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={keyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            rows={1}
            placeholder={disabled ? 'Esperando conexión…' : 'Escribe algo…'}
            aria-label="Mensaje"
          />
          <button type="button" className="icon-button" onClick={() => fileInput.current?.click()} disabled={disabled} aria-label="Adjuntar archivo">＋</button>
          <input ref={fileInput} className="sr-only" type="file" multiple onChange={chooseFiles} />
          <button type="button" className="button send-button" onClick={submit} disabled={disabled || isComposing || text.trim().length === 0}>Enviar</button>
        </div>
        <div className="text-meta"><span>Enter para enviar · Mayús+Enter para nueva línea</span></div>
      </div>
      <DrawingCanvas active={mode === 'drawing'} onSend={sendDrawing} disabled={disabled} onDirtyChange={handleDrawingDirty} onDrawingActivityChange={onDrawingActivityChange} />
    </section>
  );
}
