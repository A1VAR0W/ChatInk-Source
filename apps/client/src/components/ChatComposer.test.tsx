import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChatComposer } from './ChatComposer';

function renderComposer(overrides: Partial<ComponentProps<typeof ChatComposer>> = {}) {
  return render(
    <ChatComposer
      disabled={false}
      mode="text"
      onText={vi.fn()}
      onDrawing={vi.fn()}
      onFiles={vi.fn()}
      onCancelReply={vi.fn()}
      onTypingChange={vi.fn()}
      onDrawingActivityChange={vi.fn()}
      onModeChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ChatComposer', () => {
  it('mantiene un textarea de 50px, crece hasta 120px y vuelve a su altura inicial al enviar', () => {
    const onText = vi.fn();
    renderComposer({ onText });
    const input = screen.getByLabelText('Mensaje');
    if (!(input instanceof HTMLTextAreaElement)) throw new Error('El composer debe usar un textarea.');
    Object.defineProperty(input, 'scrollHeight', {
      configurable: true,
      get: () => input.value.length === 0 ? 50 : input.value.length > 20 ? 164 : 96,
    });

    fireEvent.change(input, { target: { value: 'Línea uno\nLínea dos\nLínea tres\nLínea cuatro\nLínea cinco\nLínea seis' } });
    expect(input.style.height).toBe('120px');
    expect(input.style.overflowY).toBe('auto');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(input).toHaveValue('');
    expect(input.style.height).toBe('50px');
    expect(input.style.overflowY).toBe('hidden');
  });

  it('sends text with Enter and keeps Shift+Enter for a new line', () => {
    const onText = vi.fn();
    renderComposer({ onText });
    const input = screen.getByLabelText('Mensaje');
    fireEvent.change(input, { target: { value: 'Hola 👋' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onText).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onText).toHaveBeenCalledWith('Hola 👋', undefined);
    expect(input).toHaveValue('');
  });

  it('disables creation while disconnected', () => {
    renderComposer({ disabled: true });
    expect(screen.getByLabelText('Mensaje')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  });

  it('does not submit while an IME composition is active', () => {
    const onText = vi.fn();
    renderComposer({ onText });
    const input = screen.getByLabelText('Mensaje');
    fireEvent.change(input, { target: { value: 'こんにちは' } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onText).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onText).toHaveBeenCalledWith('こんにちは', undefined);
  });

  it('keeps Enter available for a new line on touch devices', () => {
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    const onText = vi.fn();
    renderComposer({ onText });
    const input = screen.getByLabelText('Mensaje');
    fireEvent.change(input, { target: { value: 'Una línea' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onText).not.toHaveBeenCalled();
    if (originalMatchMedia !== undefined) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
  });

  it('does not reserve layout for the inactive drawing panel', () => {
    renderComposer();
    expect(document.querySelector('.drawing-composer')).toHaveAttribute('hidden');
  });
});
