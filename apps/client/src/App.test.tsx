import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem('chatink.message-text-size');
  localStorage.removeItem('chatink.remembered-account');
  sessionStorage.clear();
  delete document.documentElement.dataset.messageTextSize;
});

describe('access and lobby UI', () => {
  it('validates the temporary alias before contacting the server', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(<App />);
    fireEvent.change(screen.getByLabelText('¿Cómo te llamamos?'), { target: { value: '<x>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar como invitado' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Entrar como invitado' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Entrar como invitado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Versión de ChatInk incompatible');
  });

  it('aplica el mismo control de versión al acceso con cuenta', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 'CLIENT_VERSION_UNSUPPORTED',
      error: 'Versión no soportada',
    }), { status: 426, headers: { 'Content-Type': 'application/json' } }));
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Mi cuenta' }));
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'a-secure-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Versión de ChatInk incompatible');
  });

  it('ofrece una pantalla de registro con usuario, correo y contraseña', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Mi cuenta' }));
    fireEvent.click(screen.getByRole('link', { name: 'Crear una cuenta' }));
    expect(await screen.findByRole('heading', { name: /Tu cuenta/ })).toBeVisible();
    expect(screen.getByLabelText('Usuario')).toBeVisible();
    expect(screen.getByLabelText('Correo electrónico')).toBeVisible();
    expect(screen.getByLabelText('Repetir contraseña')).toBeVisible();
  });

  it('abre Amigos como un panel superpuesto y conserva el tema fuera de la interfaz', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/sessions')) return Promise.resolve(new Response(JSON.stringify({ sessionId: 'session-1', alias: 'Ada', token: 'temporary-token', expiresAt: Date.now() + 60_000 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return Promise.resolve(new Response(JSON.stringify({ rooms: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText('¿Cómo te llamamos?'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar como invitado' }));
    await screen.findByRole('heading', { name: /Dónde quieres/ });
    fireEvent.click(screen.getByRole('button', { name: /Amigos/ }));
    expect(screen.getByRole('dialog', { name: 'Amigos' })).toBeVisible();
    expect(screen.getByText('Solo para cuentas')).toBeVisible();
    expect(screen.queryByLabelText(/Activar tema/)).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Entrar como invitado' }));
    await screen.findByRole('heading', { name: /Dónde quieres/ });
    fireEvent.click(screen.getByRole('button', { name: 'Grande' }));
    await waitFor(() => expect(document.documentElement.dataset.messageTextSize).toBe('large'));
    expect(localStorage.getItem('chatink.message-text-size')).toBe('large');
  });

  it('inicia una cuenta, recuerda la sesión y ofrece cerrar sesión desde el avatar', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/accounts/login')) {
        return Promise.resolve(new Response(JSON.stringify({
          account: { id: 'account-1', username: 'Ada', email: 'ada@example.com', profilePhotoKey: null, createdAt: new Date().toISOString() },
          token: 'account-token',
          expiresAt: Date.now() + 60_000,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (url.includes('/api/sessions')) {
        return Promise.resolve(new Response(JSON.stringify({ sessionId: 'session-1', alias: 'Ada', token: 'temporary-token', expiresAt: Date.now() + 60_000 }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ rooms: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Mi cuenta' }));
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'a-secure-password' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Recordarme en este dispositivo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await screen.findByRole('heading', { name: /Dónde quieres/ });
    expect(localStorage.getItem('chatink.remembered-account')).toContain('account-token');
    fireEvent.click(screen.getByRole('button', { name: /Ada/ }));
    expect(screen.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeVisible();
  });
});
