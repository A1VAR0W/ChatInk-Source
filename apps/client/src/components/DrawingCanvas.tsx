import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { DrawingOperation, DrawingPayload, DrawingStroke } from '@pictochat/shared';
import { DrawingPreview, paintDrawing } from './DrawingPreview';
import { EraserIcon, FillIcon, PencilIcon, RedoIcon, TrashIcon, UndoIcon } from './Icons';

const COLORS = ['#17162b', '#6c5ce7', '#0984e3', '#00a884', '#f39c12', '#e84393', '#d63031', '#ffffff'];
const EMPTY: DrawingOperation[] = [];
const MAX_POINTS_PER_STROKE = 4_000;
const WHITE = '#ffffff';

type CanvasPointEvent = Pick<PointerEvent, 'clientX' | 'clientY' | 'pressure'>;

export function DrawingCanvas({
  onSend,
  disabled,
  active,
  onDirtyChange,
  onDrawingActivityChange,
}: {
  onSend: (drawing: DrawingPayload) => void;
  disabled: boolean;
  active: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onDrawingActivityChange: (isDrawing: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStroke = useRef<DrawingStroke | undefined>(undefined);
  const activePointerId = useRef<number | undefined>(undefined);
  const strokesRef = useRef<DrawingOperation[]>(EMPTY);
  const closePreviewButton = useRef<HTMLButtonElement>(null);
  const [strokes, setStrokes] = useState<DrawingOperation[]>(EMPTY);
  const [redoStack, setRedoStack] = useState<DrawingOperation[]>(EMPTY);
  const [color, setColor] = useState(COLORS[0] ?? '#17162b');
  const [width, setWidth] = useState(5);
  const [tool, setTool] = useState<'pencil' | 'eraser' | 'fill'>('pencil');
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 440 });

  const drawing = useCallback((nextStrokes: DrawingOperation[]): DrawingPayload => ({
    width: 800,
    height: 440,
    background: 'white',
    strokes: nextStrokes,
  }), []);

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
    if (!active) onDrawingActivityChange(false);
  }, [active, onDrawingActivityChange]);

  useEffect(() => () => onDrawingActivityChange(false), [onDrawingActivityChange]);

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
    if (tool === 'fill') {
      const fill = { type: 'fill' as const, color, point: point(event.nativeEvent, event.currentTarget) };
      setRedoStack([]);
      setStrokes((current) => [...current, fill]);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerId.current = event.pointerId;
    activeStroke.current = { type: 'stroke', color, width, tool, points: [point(event.nativeEvent, event.currentTarget)] };
    setRedoStack([]);
    onDrawingActivityChange(true);
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
    onDrawingActivityChange(false);
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
    setColorPickerOpen(false);
  };

  return (
    <div className="drawing-composer" hidden={!active}>
      <div className="drawing-tools" aria-label="Herramientas de dibujo">
        <button type="button" className={tool === 'pencil' ? 'tool active' : 'tool'} onClick={() => setTool('pencil')} aria-pressed={tool === 'pencil'} aria-label="Lápiz" title="Lápiz"><PencilIcon /></button>
        <button type="button" className={tool === 'eraser' ? 'tool active' : 'tool'} onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} aria-label="Goma" title="Goma"><EraserIcon /></button>
        <button type="button" className={tool === 'fill' ? 'tool active' : 'tool'} onClick={() => setTool('fill')} aria-pressed={tool === 'fill'} aria-label="Cubo de pintura" title="Cubo de pintura"><FillIcon /></button>
        <div className={colorPickerOpen ? 'color-control color-control--open' : 'color-control'}>
          <button type="button" className="color-control__trigger" aria-label="Elegir color y grosor" aria-expanded={colorPickerOpen} onClick={() => setColorPickerOpen((open) => !open)} title="Elegir color y grosor"><span className="color-control__swatch" style={{ background: color }} /><span>Color</span></button>
          {colorPickerOpen && <div className="color-control__panel" role="group" aria-label="Selector de color y grosor">
            <div className="color-picker" aria-label="Color">
              {COLORS.map((value) => (
                <button key={value} type="button" aria-label={value === WHITE ? 'Blanco no disponible sobre fondo blanco' : `Color ${value}`} title={value === WHITE ? 'El blanco no se ve sobre este fondo' : `Color ${value}`} className={color === value ? 'swatch active' : 'swatch'} style={{ background: value }} onClick={() => selectColor(value)} disabled={value === WHITE} />
              ))}
            </div>
            <label className="width-control">Grosor <input type="range" min="1" max="28" value={width} onChange={(event) => setWidth(Number(event.target.value))} aria-valuetext={`${width} píxeles`} /></label>
          </div>}
        </div>
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
        <div className="drawing-submit-actions">
          <button type="button" className="button button--secondary" disabled={strokes.length === 0} onClick={() => setShowPreview(true)}>Vista previa</button>
          <button type="button" className="button" disabled={strokes.length === 0 || disabled} onClick={submit} aria-label="Enviar ahora">Enviar ahora</button>
        </div>
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
