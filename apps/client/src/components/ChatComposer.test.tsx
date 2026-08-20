import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatComposer } from './ChatComposer';

describe('ChatComposer', () => {
  it('sends text with Enter and keeps Shift+Enter for a new line', () => {
    const onText = vi.fn();
    render(<ChatComposer disabled={false} onText={onText} onDrawing={vi.fn()} onFiles={vi.fn()} />);
    const input = screen.getByLabelText('Mensaje');
    fireEvent.change(input, { target: { value: 'Hola 👋' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onText).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onText).toHaveBeenCalledWith('Hola 👋');
    expect(input).toHaveValue('');
  });

  it('disables creation while disconnected', () => {
    render(<ChatComposer disabled onText={vi.fn()} onDrawing={vi.fn()} onFiles={vi.fn()} />);
    expect(screen.getByLabelText('Mensaje')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  });
});
