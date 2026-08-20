import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { DrawingPayload, DrawingStroke } from '@pictochat/shared';
import { DrawingPreview, paintDrawing } from './DrawingPreview';

const COLORS = ['#17162b', '#6c5ce7', '#0984e3', '#00a884', '#f39c12', '#e84393', '#d63031'];
const EMPTY: DrawingStroke[] = [];

export function DrawingCanvas({ onSend, disabled }: { onSend: (drawing: DrawingPayload) => void; disabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStroke = useRef<DrawingStroke | undefined>(undefined);
  const [strokes, setStrokes] = useState<DrawingStroke[]>(EMPTY);
  const [redoStack, setRedoStack] = useState<DrawingStroke[]>(EMPTY);
  const [color, setColor] = useState(COLORS[0] ?? '#17162b');
  const [width, setWidth] = useState(5);
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
  const [showPreview, setShowPreview] = useState(false);
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

  const drawing = useCallback((nextStrokes = strokes): DrawingPayload => ({
    width: 800,
    height: 440,
    background: theme,
    strokes: nextStrokes,
  }), [strokes, theme]);

  useEffect(() => {
    if (canvasRef.current !== null) paintDrawing(canvasRef.current, drawing());
  }, [drawing]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
      pressure: event.pressure > 0 ? event.pressure : 0.5,
    };
  };

  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activeStroke.current = { color, width, tool, points: [point(event)] };
    setRedoStack([]);
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activeStroke.current === undefined || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (activeStroke.current.points.length >= 4000) return;
    activeStroke.current.points.push(point(event));
    const next = [...strokes, activeStroke.current];
    if (canvasRef.current !== null) paintDrawing(canvasRef.current, drawing(next));
  };

  const end = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activeStroke.current === undefined) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const completedStroke = activeStroke.current;
    activeStroke.current = undefined;
    setStrokes((current) => [...current, completedStroke]);
  };

  const undo = () => setStrokes((current) => {
    const removed = current.at(-1);
    if (removed === undefined) return current;
    setRedoStack((redo) => [...redo, removed]);
    return current.slice(0, -1);
  });
  const redo = () => setRedoStack((current) => {
    const restored = current.at(-1);
    if (restored === undefined) return current;
    setStrokes((value) => [...value, restored]);
    return current.slice(0, -1);
  });
  const clear = () => {
    setRedoStack(strokes);
    setStrokes([]);
  };
  const submit = () => {
    if (strokes.length === 0) return;
    onSend(drawing());
    setStrokes([]);
    setRedoStack([]);
    setShowPreview(false);
  };

  return (
    <div className="drawing-composer">
      <div className="drawing-tools" aria-label="Herramientas de dibujo">
        <button type="button" className={tool === 'pencil' ? 'tool active' : 'tool'} onClick={() => setTool('pencil')}>Lápiz</button>
        <button type="button" className={tool === 'eraser' ? 'tool active' : 'tool'} onClick={() => setTool('eraser')}>Goma</button>
        <div className="color-picker" aria-label="Color">
          {COLORS.map((value) => (
            <button key={value} type="button" aria-label={`Color ${value}`} className={color === value ? 'swatch active' : 'swatch'} style={{ background: value }} onClick={() => { setColor(value); setTool('pencil'); }} />
          ))}
        </div>
        <label className="width-control">Grosor <input type="range" min="1" max="28" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
        <div className="drawing-actions">
          <button type="button" className="tool" onClick={undo} disabled={strokes.length === 0}>Deshacer</button>
          <button type="button" className="tool" onClick={redo} disabled={redoStack.length === 0}>Rehacer</button>
          <button type="button" className="tool tool--danger" onClick={clear} disabled={strokes.length === 0}>Limpiar</button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="drawing-canvas"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="Lienzo de dibujo. Compatible con raton, tactil y lapiz digital."
      />
      <div className="composer-footer">
        <span className="composer-hint">Dibuja con ratón, tacto o stylus</span>
        <button type="button" className="button button--secondary" disabled={strokes.length === 0} onClick={() => setShowPreview(true)}>Vista previa</button>
      </div>
      {showPreview && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="preview-title">
          <div className="modal-card preview-modal">
            <div className="modal-title"><h2 id="preview-title">¿Listo para soltarlo?</h2><button type="button" className="icon-button" onClick={() => setShowPreview(false)} aria-label="Cerrar">×</button></div>
            <DrawingPreview drawing={drawing()} />
            <div className="modal-actions">
              <button type="button" className="button button--secondary" onClick={() => setShowPreview(false)}>Seguir dibujando</button>
              <button type="button" className="button" onClick={submit} disabled={disabled}>Enviar dibujo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
