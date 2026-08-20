import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

afterEach(() => vi.restoreAllMocks());

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
});
