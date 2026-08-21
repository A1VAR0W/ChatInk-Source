import { useCallback, useLayoutEffect, useRef } from 'react';
import type { DrawingPayload } from '@pictochat/shared';

export interface PaintDrawingOptions {
  cssWidth?: number;
  cssHeight?: number;
  pixelRatio?: number;
}

export function paintDrawing(canvas: HTMLCanvasElement, drawing: DrawingPayload, options: PaintDrawingOptions = {}): void {
  const context = canvas.getContext('2d');
  if (context === null) return;
  const cssWidth = options.cssWidth ?? drawing.width;
  const cssHeight = options.cssHeight ?? drawing.height;
  const pixelRatio = Math.max(1, Math.min(options.pixelRatio ?? 1, 3));
  const width = Math.max(1, Math.round(cssWidth * pixelRatio));
  const height = Math.max(1, Math.round(cssHeight * pixelRatio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const background = drawing.background === 'dark' ? '#17162b' : '#ffffff';
  const scaleX = canvas.width / drawing.width;
  const scaleY = canvas.height / drawing.height;
  context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  context.fillStyle = background;
  context.fillRect(0, 0, drawing.width, drawing.height);
  if (drawing.background === 'logo') {
    const size = Math.min(drawing.width, drawing.height) * 0.13;
    context.save();
    context.translate(drawing.width / 2, drawing.height / 2);
    context.globalAlpha = 0.1;
    context.fillStyle = '#6c5ce7';
    context.beginPath();
    context.moveTo(0, -size * 0.8);
    context.bezierCurveTo(size * 0.7, -size * 0.05, size * 0.68, size * 0.58, 0, size * 0.82);
    context.bezierCurveTo(-size * 0.68, size * 0.58, -size * 0.7, -size * 0.05, 0, -size * 0.8);
    context.fill();
    context.globalAlpha = 0.65;
    context.strokeStyle = '#ffffff';
    context.lineWidth = Math.max(2, size * 0.08);
    context.beginPath();
    context.moveTo(-size * 0.27, size * 0.07);
    context.quadraticCurveTo(0, size * 0.28, size * 0.3, -size * 0.08);
    context.stroke();
    context.restore();
  }
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const stroke of drawing.strokes) {
    context.strokeStyle = stroke.tool === 'eraser' ? background : stroke.color;
    const first = stroke.points[0];
    if (first === undefined) continue;
    const pointWidth = (pressure: number) => stroke.width * (stroke.tool === 'eraser' ? 1 : 0.6 + pressure * 0.8);
    if (stroke.points.length === 1) {
      context.beginPath();
      context.arc(first.x * drawing.width, first.y * drawing.height, pointWidth(first.pressure) / 2, 0, Math.PI * 2);
      context.fillStyle = stroke.tool === 'eraser' ? background : stroke.color;
      context.fill();
    } else {
      for (let index = 1; index < stroke.points.length; index += 1) {
        const previous = stroke.points[index - 1];
        const point = stroke.points[index];
        if (previous === undefined || point === undefined) continue;
        context.lineWidth = pointWidth((previous.pressure + point.pressure) / 2);
        context.beginPath();
        context.moveTo(previous.x * drawing.width, previous.y * drawing.height);
        context.lineTo(point.x * drawing.width, point.y * drawing.height);
        context.stroke();
      }
    }
  }
}

export function DrawingPreview({ drawing, className = '' }: { drawing: DrawingPayload; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    paintDrawing(canvas, drawing, { cssWidth: bounds.width, cssHeight: bounds.height, pixelRatio: window.devicePixelRatio });
  }, [drawing]);
  useLayoutEffect(() => {
    render();
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [render]);
  return <canvas ref={canvasRef} className={`drawing-preview ${className}`} style={{ aspectRatio: `${drawing.width} / ${drawing.height}` }} aria-label="Dibujo enviado" />;
}
