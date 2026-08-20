import { useEffect, useRef } from 'react';
import type { DrawingPayload } from '@pictochat/shared';

export function paintDrawing(canvas: HTMLCanvasElement, drawing: DrawingPayload): void {
  const context = canvas.getContext('2d');
  if (context === null) return;
  if (canvas.width !== drawing.width) canvas.width = drawing.width;
  if (canvas.height !== drawing.height) canvas.height = drawing.height;
  const background = drawing.background === 'dark' ? '#17162b' : '#fffdfa';
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const stroke of drawing.strokes) {
    context.strokeStyle = stroke.tool === 'eraser' ? background : stroke.color;
    context.lineWidth = stroke.width;
    const first = stroke.points[0];
    if (first === undefined) continue;
    context.beginPath();
    context.moveTo(first.x * canvas.width, first.y * canvas.height);
    if (stroke.points.length === 1) {
      context.lineTo(first.x * canvas.width + 0.1, first.y * canvas.height + 0.1);
    } else {
      for (const point of stroke.points.slice(1)) context.lineTo(point.x * canvas.width, point.y * canvas.height);
    }
    context.stroke();
  }
}

export function DrawingPreview({ drawing, className = '' }: { drawing: DrawingPayload; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current !== null) paintDrawing(canvasRef.current, drawing);
  }, [drawing]);
  return <canvas ref={canvasRef} className={`drawing-preview ${className}`} aria-label="Dibujo enviado" />;
}
