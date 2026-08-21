import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { DrawingPayload, DrawingStroke } from '@pictochat/shared';
import { DrawingPreview, paintDrawing } from './DrawingPreview';
import { CanvasIcon, EraserIcon, InkMarkIcon, PencilIcon, RedoIcon, TrashIcon, UndoIcon } from './Icons';

const COLORS = ['#17162b', '#6c5ce7', '#0984e3', '#00a884', '#f39c12', '#e84393', '#d63031', '#ffffff'];
const EMPTY: DrawingStroke[] = [];
const MAX_POINTS_PER_STROKE = 4_000;
const WHITE = '#ffffff';

type ComposerBackground = Extract<DrawingPayload['background'], 'white' | 'logo'>;

type CanvasPointEvent = Pick<PointerEvent, 'clientX' | 'clientY' | 'pressure'>;

export function DrawingCanvas({
  onSend,
  disabled,
  active,
  onDirtyChange,
}: {
  onSend: (drawing: DrawingPayload) => void;
  disabled: boolean;
  active: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStroke = useRef<DrawingStroke | undefined>(undefined);
  const activePointerId = useRef<number | undefined>(undefined);
  const strokesRef = useRef<DrawingStroke[]>(EMPTY);
  const closePreviewButton = useRef<HTMLButtonElement>(null);
  const [strokes, setStrokes] = useState<DrawingStroke[]>(EMPTY);
  const [redoStack, setRedoStack] = useState<DrawingStroke[]>(EMPTY);
  const [color, setColor] = useState(COLORS[0] ?? '#17162b');
  const [width, setWidth] = useState(5);
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
  const [background, setBackground] = useState<ComposerBackground>('white');
  const [showPreview, setShowPreview] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 440 });

  const drawing = useCallback((nextStrokes: DrawingStroke[]): DrawingPayload => ({
    width: 800,
    height: 440,
    background,
    strokes: nextStrokes,
  }), [background]);

  const render = useCallback((committed = strokesRef.current, inProgress = activeStroke.current) => {
    const canvas = canvasRef.current;
    if (canvas === null || canvasSize.width <= 0 || canvasSize.height <= 0) return;
    const nextStrokes = inProgress === undefined ? committed : [...committed, inProgress];
    paintDrawing(canvas, drawing(nextStrokes), {
      cssWidth: canvasSize.width,
      cssHeight: canvasSize.height,
      pixelRatio: window.devicePixelRatio,
    });
  }, [canvasSize.height, canvasSize.width, drawing]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!active || canvas === null) return;
    const updateSize = () => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        setCanvasSize({ width: Math.round(bounds.width), height: Math.round(bounds.height) });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    strokesRef.current = strokes;
    onDirtyChange(strokes.length > 0);
    if (active) render(strokes);
  }, [active, onDirtyChange, render, strokes]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  useEffect(() => {
    if (!showPreview) return;
    closePreviewButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowPreview(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showPreview]);

  const point = (event: CanvasPointEvent, canvas: HTMLCanvasElement) => {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
      pressure: event.pressure > 0 ? Math.min(1, event.pressure) : 0.5,
    };
  };

  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || !active || !event.isPrimary || activePointerId.current !== undefined) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerId.current = event.pointerId;
    activeStroke.current = { color, width, tool, points: [point(event.nativeEvent, event.currentTarget)] };
    setRedoStack([]);
    render(strokesRef.current, activeStroke.current);
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activeStroke.current === undefined || activePointerId.current !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    for (const sample of coalesced) {
      if (activeStroke.current.points.length >= MAX_POINTS_PER_STROKE) break;
      activeStroke.current.points.push(point(sample, event.currentTarget));
    }
    render(strokesRef.current, activeStroke.current);
  };

  const finish = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activeStroke.current === undefined || activePointerId.current !== event.pointerId) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const completedStroke = activeStroke.current;
    activeStroke.current = undefined;
    activePointerId.current = undefined;
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
    setRedoStack(strokesRef.current);
    setStrokes([]);
  };
  const submit = () => {
    if (strokesRef.current.length === 0 || disabled) return;
    onSend(drawing(strokesRef.current));
    setStrokes([]);
    setRedoStack([]);
    setShowPreview(false);
  };

  const selectColor = (value: string) => {
    if (value === WHITE) return;
    setColor(value);
    setTool('pencil');
  };

  return (
    <div className="drawing-composer" hidden={!active}>
      <div className="drawing-tools" aria-label="Herramientas de dibujo">
        <button type="button" className={tool === 'pencil' ? 'tool active' : 'tool'} onClick={() => setTool('pencil')} aria-pressed={tool === 'pencil'} aria-label="Lápiz" title="Lápiz"><PencilIcon /></button>
        <button type="button" className={tool === 'eraser' ? 'tool active' : 'tool'} onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} aria-label="Goma" title="Goma"><EraserIcon /></button>
        <div className="drawing-background" role="group" aria-label="Fondo del lienzo">
          <button type="button" className={background === 'white' ? 'tool active' : 'tool'} onClick={() => setBackground('white')} aria-pressed={background === 'white'} aria-label="Fondo blanco" title="Fondo blanco"><CanvasIcon /></button>
          <button type="button" className={background === 'logo' ? 'tool active' : 'tool'} onClick={() => setBackground('logo')} aria-pressed={background === 'logo'} aria-label="Fondo con icono ChatInk" title="Fondo con icono ChatInk"><InkMarkIcon /></button>
        </div>
        <div className="color-picker" aria-label="Color">
          {COLORS.map((value) => (
            <button key={value} type="button" aria-label={value === WHITE ? 'Blanco no disponible sobre fondo blanco' : `Color ${value}`} title={value === WHITE ? 'El blanco no se ve sobre este fondo' : `Color ${value}`} className={color === value ? 'swatch active' : 'swatch'} style={{ background: value }} onClick={() => selectColor(value)} disabled={value === WHITE} />
          ))}
        </div>
        <label className="width-control">Grosor <input type="range" min="1" max="28" value={width} onChange={(event) => setWidth(Number(event.target.value))} aria-valuetext={`${width} píxeles`} /></label>
        <output className="width-value" aria-label={`Grosor actual: ${width} píxeles`}>{width}</output>
        <div className="drawing-actions">
          <button type="button" className="tool" onClick={undo} disabled={strokes.length === 0} aria-label="Deshacer" title="Deshacer"><UndoIcon /></button>
          <button type="button" className="tool" onClick={redo} disabled={redoStack.length === 0} aria-label="Rehacer" title="Rehacer"><RedoIcon /></button>
          <button type="button" className="tool tool--danger" onClick={clear} disabled={strokes.length === 0} aria-label="Limpiar lienzo" title="Limpiar lienzo"><TrashIcon /></button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="drawing-canvas"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        aria-label="Lienzo de dibujo. Compatible con ratón, tactil y lápiz digital."
      />
      <div className="composer-footer">
        <span className="composer-hint">El dibujo se conserva si vuelves al texto. Limpiar se puede recuperar con Rehacer.</span>
        <button type="button" className="button button--secondary" disabled={strokes.length === 0} onClick={() => setShowPreview(true)}>Vista previa</button>
      </div>
      {showPreview && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="preview-title">
          <div className="modal-card preview-modal">
            <div className="modal-title"><h2 id="preview-title">¿Listo para soltarlo?</h2><button ref={closePreviewButton} type="button" className="icon-button" onClick={() => setShowPreview(false)} aria-label="Cerrar vista previa">×</button></div>
            <DrawingPreview drawing={drawing(strokes)} />
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
