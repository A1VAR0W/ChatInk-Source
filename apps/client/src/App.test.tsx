import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem('chatink.message-text-size');
  delete document.documentElement.dataset.messageTextSize;
});

describe('access and lobby UI', () => {
  it('validates the temporary alias before contacting the server', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(<App />);
    fireEvent.change(screen.getByLabelText('¿Cómo te llamamos?'), { target: { value: '<x>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Usa letras');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates an anonymous session and reaches the lobby', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/sessions')) {
        return Promise.resolve(new Response(JSON.stringify({ sessionId: 'session-1', alias: 'Ada', token: 'temporary-token', expiresAt: Date.now() + 60_000 }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ rooms: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText('¿Cómo te llamamos?'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Dónde quieres/ })).toBeInTheDocument());
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(sessionStorage.getItem('doodledrop.session')).toContain('temporary-token');
  });

  it('muestra el error de versión incompatible al intentar entrar', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 'CLIENT_VERSION_UNSUPPORTED',
      error: 'Versión no soportada',
    }), { status: 426, headers: { 'Content-Type': 'application/json' } }));
    render(<App />);
    fireEvent.change(screen.getByLabelText('¿Cómo te llamamos?'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Versión de ChatInk incompatible');
  });

  it('guarda el tamaño de lectura elegido desde el lobby', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/sessions')) {
        return Promise.resolve(new Response(JSON.stringify({ sessionId: 'session-1', alias: 'Ada', token: 'temporary-token', expiresAt: Date.now() + 60_000 }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ rooms: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText('¿Cómo te llamamos?'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('heading', { name: /Dónde quieres/ });
    fireEvent.click(screen.getByRole('button', { name: 'Grande' }));
    await waitFor(() => expect(document.documentElement.dataset.messageTextSize).toBe('large'));
    expect(localStorage.getItem('chatink.message-text-size')).toBe('large');
  });
});
