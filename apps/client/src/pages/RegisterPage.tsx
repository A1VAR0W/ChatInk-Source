import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { api, entryApiError } from '../services/api';
import { useSession } from '../state/session';

export function RegisterPage() {
  const { session, setAccountSession } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session !== undefined) void navigate('/lobby', { replace: true });
  }, [session, navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (username.trim().length < 2) return setError('El usuario debe tener al menos 2 caracteres');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Introduce un correo electrónico válido');
    if (password.length < 10) return setError('La contraseña debe tener al menos 10 caracteres');
    if (password !== confirmation) return setError('Las contraseñas no coinciden');
    setLoading(true);
    setError(undefined);
    try {
      const authentication = await api.registerAccount({ username: username.trim(), email: email.trim(), password });
      const chatSession = await api.createSession(authentication.account.username);
      setAccountSession(chatSession, authentication, remember);
      void navigate('/lobby', { replace: true });
    } catch (requestError) {
      setError(entryApiError(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="entry-page register-page">
      <div className="entry-top"><Brand /></div>
      <section className="entry-card register-card">
        <Link className="back-link" to="/">← Volver a entrar</Link>
        <div className="eyebrow">CREA TU IDENTIDAD</div>
        <h1>Tu cuenta,<br /><span>tu trazo.</span></h1>
        <p className="lead">Guarda tu perfil y tus preferencias. Los mensajes y dibujos de las salas seguirán desapareciendo.</p>
        <form className="access-form" onSubmit={(event) => void submit(event)} noValidate>
          <label htmlFor="register-username">Usuario</label>
          <input id="register-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={24} placeholder="2–24 caracteres" />
          <label htmlFor="register-email">Correo electrónico</label>
          <input id="register-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} placeholder="tu@correo.com" inputMode="email" />
          <div className="password-grid">
            <label htmlFor="register-password">Contraseña<input id="register-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" maxLength={128} placeholder="10 caracteres o más" /></label>
            <label htmlFor="register-confirmation">Repetir contraseña<input id="register-confirmation" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" maxLength={128} placeholder="Repite la contraseña" /></label>
          </div>
          <label className="remember-choice"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span><strong>Recordarme en este dispositivo</strong><small>Puedes cerrar sesión desde tu foto de perfil.</small></span></label>
          <button className="button button--full" type="submit" disabled={loading}>{loading ? 'Creando cuenta…' : 'Crear cuenta y entrar'}</button>
          {error !== undefined && <small className="error-text" role="alert">{error}</small>}
        </form>
      </section>
    </main>
  );
}
