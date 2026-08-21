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
      onModeChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ChatComposer', () => {
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
});
