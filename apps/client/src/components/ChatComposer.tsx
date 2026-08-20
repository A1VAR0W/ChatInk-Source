import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { DrawingPayload } from '@pictochat/shared';
import { DrawingCanvas } from './DrawingCanvas';

const EMOJIS = ['👋', '✨', '😂', '❤️', '👍', '🎨', '🔥', '🤔'];

export function ChatComposer({
  disabled,
  onText,
  onDrawing,
  onFiles,
}: {
  disabled: boolean;
  onText: (text: string) => void;
  onDrawing: (drawing: DrawingPayload) => void;
  onFiles: (files: FileList) => void;
}) {
  const [mode, setMode] = useState<'text' | 'drawing'>('text');
  const [text, setText] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const submit = () => {
    const value = text.trim();
    if (value.length === 0 || disabled) return;
    onText(value);
    setText('');
    setShowEmojis(false);
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };
  const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files !== null && event.target.files.length > 0) onFiles(event.target.files);
    event.target.value = '';
  };

  return (
    <section className="composer" aria-label="Crear mensaje">
      <div className="mode-tabs" role="tablist" aria-label="Tipo de mensaje">
        <button type="button" role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')}>Texto</button>
        <button type="button" role="tab" aria-selected={mode === 'drawing'} className={mode === 'drawing' ? 'active' : ''} onClick={() => setMode('drawing')}>Dibujo <span className="badge">principal</span></button>
      </div>
      {mode === 'text' ? (
        <div className="text-composer">
          {showEmojis && <div className="emoji-picker" aria-label="Emojis">{EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => setText((value) => `${value}${emoji}`)}>{emoji}</button>)}</div>}
          <div className="text-row">
            <button type="button" className="icon-button" onClick={() => setShowEmojis((value) => !value)} aria-label="Elegir emoji">☺</button>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 1000))}
              onKeyDown={keyDown}
              disabled={disabled}
              rows={1}
              maxLength={1000}
              placeholder={disabled ? 'Esperando conexión…' : 'Escribe algo…'}
              aria-label="Mensaje"
            />
            <button type="button" className="icon-button" onClick={() => fileInput.current?.click()} disabled={disabled} aria-label="Adjuntar archivo">＋</button>
            <input ref={fileInput} className="sr-only" type="file" multiple onChange={chooseFiles} />
            <button type="button" className="button send-button" onClick={submit} disabled={disabled || text.trim().length === 0}>Enviar</button>
          </div>
          <div className="text-meta"><span>Enter para enviar · Mayús+Enter para nueva línea</span><span>{text.length}/1000</span></div>
        </div>
      ) : <DrawingCanvas onSend={onDrawing} disabled={disabled} />}
    </section>
  );
}
