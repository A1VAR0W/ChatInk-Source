import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { RoomSummary } from '@pictochat/shared';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { Avatar } from '../components/Avatar';
import { ThemeToggle } from '../components/ThemeToggle';
import { ApiClientError, api } from '../services/api';
import { useSession } from '../state/session';
import { useMessageTextSize } from '../state/messageTextSize';

export function LobbyPage() {
  const { session, clearSession, rememberRoom } = useSession();
  const { messageTextSize, setMessageTextSize } = useMessageTextSize();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [publicRooms, setPublicRooms] = useState<RoomSummary[]>([]);
  const [roomName, setRoomName] = useState('Sala de garabatos');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [createPassword, setCreatePassword] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(12);
  const [joinCode, setJoinCode] = useState((searchParams.get('room') ?? '').toUpperCase());
  const [joinPassword, setJoinPassword] = useState('');
  const [error, setError] = useState<string>();
  const [loadingAction, setLoadingAction] = useState<'create' | 'join'>();
  const [mobileAction, setMobileAction] = useState<'create' | 'join'>(() => searchParams.get('room') === null ? 'create' : 'join');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileMenuOpen]);

  const loadRooms = useCallback(async () => {
    try {
      const response = await api.publicRooms();
      setPublicRooms(response.rooms);
    } catch {
      setPublicRooms([]);
    }
  }, []);
  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadRooms(), 0);
    const refreshTimer = window.setInterval(() => void loadRooms(), 15_000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(refreshTimer); };
  }, [loadRooms]);

  if (session === undefined) return null;

  const enter = (access: Awaited<ReturnType<typeof api.joinRoom>>) => {
    rememberRoom(access);
    void navigate(`/room/${access.room.id}`);
  };
  const explain = (requestError: unknown) => setError(requestError instanceof ApiClientError ? requestError.message : 'No se pudo completar la acción');

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setLoadingAction('create');
    setError(undefined);
    try {
      const access = await api.createRoom(session.token, {
        name: roomName.trim(),
        visibility,
        maxParticipants,
        ...(visibility === 'private' && createPassword.length > 0 ? { password: createPassword } : {}),
      });
      enter(access);
    } catch (requestError) {
      explain(requestError);
    } finally {
      setLoadingAction(undefined);
    }
  };

  const join = async (event: FormEvent) => {
    event.preventDefault();
    setLoadingAction('join');
    setError(undefined);
    try {
      enter(await api.joinRoom(session.token, joinCode.trim().toUpperCase(), joinPassword || undefined));
    } catch (requestError) {
      explain(requestError);
    } finally {
      setLoadingAction(undefined);
    }
  };

  return (
    <main className="lobby-page">
      <header className="app-header">
        <Brand compact />
        <div ref={profileMenuRef} className="profile-menu">
          <button type="button" className="header-user" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}>
            <Avatar alias={session.alias} /><span className="header-user__name"><small>{session.mode === 'account' ? 'Cuenta' : 'Invitado'}</small><strong>{session.alias}</strong></span><span className="profile-menu__chevron" aria-hidden="true">⌄</span>
          </button>
          {profileMenuOpen && (
            <div className="profile-menu__popover" role="menu">
              <div className="profile-menu__identity"><Avatar alias={session.alias} /><span><strong>{session.alias}</strong><small>{session.account?.email ?? 'Sesión temporal'}</small></span></div>
              <button type="button" role="menuitem" disabled>Perfil <small>Próximamente</small></button>
              <button type="button" role="menuitem" disabled>Opciones <small>Próximamente</small></button>
              <button type="button" role="menuitem" className="profile-menu__logout" onClick={() => { clearSession(); void navigate('/'); }}>Cerrar sesión</button>
            </div>
          )}
        </div>
        <div className="header-actions"><ThemeToggle /></div>
      </header>
      <div className="lobby-content">
        <section className="lobby-intro"><div className="eyebrow">ELIGE TU PUERTA</div><h1>¿Dónde quieres <span>garabatear?</span></h1><p>Crea un espacio nuevo o entra con el código que te hayan compartido.</p></section>
        <section className="message-size-setting" aria-label="Tamaño de letra de los mensajes">
          <span>Letra de los mensajes</span>
          <div className="segmented message-size-setting__options" role="group" aria-label="Tamaño de letra">
            {([
              ['small', 'Pequeña'],
              ['medium', 'Mediana'],
              ['large', 'Grande'],
            ] as const).map(([size, label]) => <button key={size} type="button" className={messageTextSize === size ? 'active' : ''} aria-pressed={messageTextSize === size} onClick={() => setMessageTextSize(size)}>{label}</button>)}
          </div>
        </section>
        {error !== undefined && <div className="alert alert--error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(undefined)} aria-label="Cerrar">×</button></div>}
        <div className="lobby-mobile-switcher" role="tablist" aria-label="Acción principal">
          <button type="button" role="tab" aria-selected={mobileAction === 'create'} className={mobileAction === 'create' ? 'active' : ''} onClick={() => setMobileAction('create')}>Crear sala</button>
          <button type="button" role="tab" aria-selected={mobileAction === 'join'} className={mobileAction === 'join' ? 'active' : ''} onClick={() => setMobileAction('join')}>Entrar con código</button>
        </div>
        <div className={`lobby-grid lobby-grid--${mobileAction}`}>
          <form className="panel create-panel" onSubmit={(event) => void create(event)}>
            <div className="panel-icon panel-icon--purple" aria-hidden="true">✦</div>
            <div><h2>Crear una sala</h2><p>Tú decides quién entra y cuándo termina.</p></div>
            <label>Nombre de la sala<input value={roomName} onChange={(event) => setRoomName(event.target.value)} minLength={2} maxLength={48} required /></label>
            <details className="room-options">
              <summary>Ajustes de la sala <span>Opcional</span></summary>
              <div className="room-options__content">
                <fieldset><legend>Visibilidad</legend><div className="segmented"><label><input type="radio" name="visibility" checked={visibility === 'public'} onChange={() => setVisibility('public')} />Pública</label><label><input type="radio" name="visibility" checked={visibility === 'private'} onChange={() => setVisibility('private')} />Privada</label></div></fieldset>
                {visibility === 'private' && <label>Contraseña <span>(opcional)</span><input type="password" value={createPassword} onChange={(event) => setCreatePassword(event.target.value)} minLength={8} maxLength={128} placeholder="8 caracteres o más" /></label>}
                <label>Máximo de participantes <span>{maxParticipants}</span><input type="range" min="2" max="24" value={maxParticipants} onChange={(event) => setMaxParticipants(Number(event.target.value))} /></label>
              </div>
            </details>
            <button className="button button--full" type="submit" disabled={loadingAction !== undefined || roomName.trim().length < 2}>{loadingAction === 'create' ? 'Creando…' : 'Crear sala'}</button>
          </form>

          <form className="panel join-panel" onSubmit={(event) => void join(event)}>
            <div className="panel-icon panel-icon--green" aria-hidden="true">⌁</div>
            <div><h2>Entrar con código</h2><p>Pega el código o abre el enlace de invitación.</p></div>
            <label>Código de sala<input className="code-input" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 10))} minLength={10} maxLength={10} placeholder="ABCD234567" required /></label>
            <label>Contraseña <span>(si la tiene)</span><input type="password" value={joinPassword} onChange={(event) => setJoinPassword(event.target.value)} maxLength={128} /></label>
            <button className="button button--green button--full" type="submit" disabled={loadingAction !== undefined || joinCode.length !== 10}>{loadingAction === 'join' ? 'Entrando…' : 'Entrar en la sala'}</button>
          </form>
        </div>

        <section className="public-section">
          <div className="section-title"><div><h2>Salas públicas ahora</h2><p>Visibles mientras sigan vivas.</p></div><button type="button" className="text-button" onClick={() => void loadRooms()}>Actualizar</button></div>
          {publicRooms.length === 0 ? <div className="public-empty">No hay salas públicas activas. Puedes abrir la primera.</div> : (
            <div className="room-cards">{publicRooms.map((room) => (
              <article className="room-card" key={room.id}><div><strong>{room.name}</strong><span>{room.participantCount}/{room.maxParticipants} conectados</span></div><code>{room.code}</code><button type="button" className="button button--small" onClick={() => { setJoinCode(room.code); void api.joinRoom(session.token, room.code).then(enter).catch(explain); }}>Entrar</button></article>
            ))}</div>
          )}
        </section>
      </div>
    </main>
  );
}
