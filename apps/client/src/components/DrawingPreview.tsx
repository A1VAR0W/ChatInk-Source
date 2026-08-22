import { useCallback, useLayoutEffect, useRef } from 'react';
import type { DrawingFill, DrawingPayload } from '@pictochat/shared';

export interface PaintDrawingOptions {
  cssWidth?: number;
  cssHeight?: number;
  pixelRatio?: number;
}

function rgba(hex: string): [number, number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
    255,
  ];
}

function samePixel(data: Uint8ClampedArray, offset: number, color: readonly number[]): boolean {
  return data[offset] === color[0] && data[offset + 1] === color[1] && data[offset + 2] === color[2] && data[offset + 3] === color[3];
}

function paintFill(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, fill: DrawingFill): void {
  const x = Math.max(0, Math.min(canvas.width - 1, Math.round(fill.point.x * (canvas.width - 1))));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.round(fill.point.y * (canvas.height - 1))));
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const targetOffset = (y * canvas.width + x) * 4;
  const target = [image.data[targetOffset] ?? 0, image.data[targetOffset + 1] ?? 0, image.data[targetOffset + 2] ?? 0, image.data[targetOffset + 3] ?? 0];
  const replacement = rgba(fill.color);
  if (target.every((value, index) => value === replacement[index])) return;

  const paint = (pixelX: number, pixelY: number) => {
    const offset = (pixelY * canvas.width + pixelX) * 4;
    image.data[offset] = replacement[0];
    image.data[offset + 1] = replacement[1];
    image.data[offset + 2] = replacement[2];
    image.data[offset + 3] = replacement[3];
  };
  const matches = (pixelX: number, pixelY: number) => samePixel(image.data, (pixelY * canvas.width + pixelX) * 4, target);
  const pending: Array<[number, number]> = [[x, y]];
  while (pending.length > 0) {
    const next = pending.pop();
    if (next === undefined) continue;
    const [startX, startY] = next;
    if (!matches(startX, startY)) continue;
    let left = startX;
    let right = startX;
    while (left > 0 && matches(left - 1, startY)) left -= 1;
    while (right + 1 < canvas.width && matches(right + 1, startY)) right += 1;
    for (let column = left; column <= right; column += 1) paint(column, startY);
    for (const adjacentRow of [startY - 1, startY + 1]) {
      if (adjacentRow < 0 || adjacentRow >= canvas.height) continue;
      let inSpan = false;
      for (let column = left; column <= right; column += 1) {
        if (matches(column, adjacentRow)) {
          if (!inSpan) pending.push([column, adjacentRow]);
          inSpan = true;
        } else {
          inSpan = false;
        }
      }
    }
  }
  context.putImageData(image, 0, 0);
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
  for (const operation of drawing.strokes) {
    if (operation.type === 'fill') {
      paintFill(context, canvas, operation);
      continue;
    }
    const stroke = operation;
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
