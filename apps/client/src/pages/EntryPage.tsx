import { useEffect, useState, type FormEvent } from 'react';
import { aliasSchema } from '@pictochat/shared';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { api, entryApiError } from '../services/api';
import { useSession } from '../state/session';

export function EntryPage() {
  const { session, restoringAccount, setGuestSession, setAccountSession } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [alias, setAlias] = useState('');
  const [mode, setMode] = useState<'guest' | 'account'>('guest');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session !== undefined) void navigate(`/lobby${location.search}`, { replace: true });
  }, [session, navigate, location.search]);

  const submitGuest = async (event: FormEvent) => {
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
      setGuestSession(created);
      void navigate(`/lobby${location.search}`, { replace: true });
    } catch (requestError) {
      setError(entryApiError(requestError));
    } finally {
      setLoading(false);
    }
  };

  const submitAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || password.length < 10) {
      setError('Introduce tu correo y una contraseña de al menos 10 caracteres');
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const authentication = await api.loginAccount({ email: email.trim(), password });
      const chatSession = await api.createSession(authentication.account.username);
      setAccountSession(chatSession, authentication, remember);
      void navigate(`/lobby${location.search}`, { replace: true });
    } catch (requestError) {
      setError(entryApiError(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="entry-page">
      <div className="entry-top"><Brand /></div>
      <section className="entry-card entry-card--access">
        <div className="eyebrow">TU ESPACIO, A TU MANERA</div>
        <h1>Entra, dibuja,<br /><span>déjalo ir.</span></h1>
        <p className="lead">Accede a tu cuenta o entra al instante como invitado. Las salas siguen siendo temporales.</p>
        <div className="access-tabs" role="tablist" aria-label="Forma de acceso">
          <button type="button" role="tab" aria-selected={mode === 'guest'} className={mode === 'guest' ? 'active' : ''} onClick={() => { setMode('guest'); setError(undefined); }}>Invitado</button>
          <button type="button" role="tab" aria-selected={mode === 'account'} className={mode === 'account' ? 'active' : ''} onClick={() => { setMode('account'); setError(undefined); }}>Mi cuenta</button>
        </div>
        {mode === 'guest' ? (
          <form className="access-form" onSubmit={(event) => void submitGuest(event)} noValidate>
            <label htmlFor="alias">¿Cómo te llamamos?</label>
            <input id="alias" value={alias} onChange={(event) => setAlias(event.target.value)} autoComplete="nickname" maxLength={24} placeholder="Tu alias temporal" aria-describedby={error === undefined ? 'alias-help' : 'entry-error'} />
            <button type="submit" className="button button--full" disabled={loading}>{loading ? 'Entrando…' : 'Entrar como invitado'}</button>
            {error === undefined ? <small id="alias-help">No necesita cuenta y se guarda solo durante esta sesión.</small> : <small id="entry-error" className="error-text" role="alert">{error}</small>}
          </form>
        ) : (
          <form className="access-form" onSubmit={(event) => void submitAccount(event)} noValidate>
            <label htmlFor="email">Correo electrónico</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} placeholder="tu@correo.com" inputMode="email" />
            <label htmlFor="password">Contraseña</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" maxLength={128} placeholder="Tu contraseña" />
            <label className="remember-choice"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span><strong>Recordarme en este dispositivo</strong><small>Entrarás directamente la próxima vez.</small></span></label>
            <button type="submit" className="button button--full" disabled={loading || restoringAccount}>{loading || restoringAccount ? 'Entrando…' : 'Iniciar sesión'}</button>
            {error !== undefined && <small id="entry-error" className="error-text" role="alert">{error}</small>}
            <p className="access-register">¿Aún no tienes cuenta? <Link to="/register">Crear una cuenta</Link></p>
          </form>
        )}
        <div className="privacy-note"><span aria-hidden="true">⌁</span><p><strong>La sala sigue siendo efímera.</strong><br />Tu cuenta guarda tu identidad y preferencias, no el historial de las salas.</p></div>
      </section>
      <div className="entry-doodle" aria-hidden="true"><span>〰</span><span>✦</span><span>○</span></div>
    </main>
  );
}
