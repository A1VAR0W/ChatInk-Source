import { useEffect, useRef } from 'react';
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
  const background = drawing.background === 'dark' ? '#17162b' : '#fffdfa';
  const scaleX = canvas.width / drawing.width;
  const scaleY = canvas.height / drawing.height;
  context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  context.fillStyle = background;
  context.fillRect(0, 0, drawing.width, drawing.height);
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
  useEffect(() => {
    if (canvasRef.current !== null) paintDrawing(canvasRef.current, drawing);
  }, [drawing]);
  return <canvas ref={canvasRef} className={`drawing-preview ${className}`} aria-label="Dibujo enviado" />;
}
