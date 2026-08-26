import { useEffect, useState, type FormEvent } from 'react';
import { aliasSchema } from '@pictochat/shared';
import { useLocation, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { ThemeToggle } from '../components/ThemeToggle';
import { ApiClientError, api } from '../services/api';
import { useSession } from '../state/session';

export function EntryPage() {
  const { session, setSession } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [alias, setAlias] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session !== undefined) void navigate(`/lobby${location.search}`, { replace: true });
  }, [session, navigate, location.search]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = aliasSchema.safeParse(alias);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'El alias no es válido');
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const created = await api.createSession(parsed.data);
      setSession(created);
      void navigate(`/lobby${location.search}`, { replace: true });
    } catch (requestError) {
      setError(requestError instanceof ApiClientError && (requestError.code === 'CLIENT_VERSION_UNSUPPORTED' || requestError.status === 426)
        ? 'La versión de ChatInk es incompatible. Actualiza la aplicación para continuar.'
        : requestError instanceof ApiClientError ? requestError.message : 'No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="entry-page">
      <div className="entry-top"><Brand /><ThemeToggle /></div>
      <section className="entry-card">
        <div className="eyebrow">CHAT EFÍMERO · SIN CUENTAS</div>
        <h1>Entra, dibuja,<br /><span>déjalo ir.</span></h1>
        <p className="lead">Salas temporales para hablar, garabatear y compartir. Al cerrar la sala, todo desaparece.</p>
        <form onSubmit={(event) => void submit(event)} noValidate>
          <label htmlFor="alias">¿Cómo te llamamos?</label>
          <div className="input-with-action">
            <input
              id="alias"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              autoComplete="nickname"
              autoFocus
              maxLength={24}
              placeholder="Tu alias temporal"
              aria-describedby={error === undefined ? 'alias-help' : 'alias-error'}
            />
            <button type="submit" className="button" disabled={loading}>{loading ? 'Entrando…' : 'Continuar'}</button>
          </div>
          {error === undefined
            ? <small id="alias-help">2–24 caracteres. Se guarda solo durante esta pestaña.</small>
            : <small id="alias-error" className="error-text" role="alert">{error}</small>}
        </form>
        <div className="privacy-note"><span aria-hidden="true">⌁</span><p><strong>Lo temporal es la regla.</strong><br />Sin historial ni perfiles permanentes. Cifrado en tránsito al desplegar con HTTPS.</p></div>
      </section>
      <div className="entry-doodle" aria-hidden="true"><span>〰</span><span>✦</span><span>○</span></div>
    </main>
  );
}
