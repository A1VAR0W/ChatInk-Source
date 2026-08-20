import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { RoomSummary } from '@pictochat/shared';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { ThemeToggle } from '../components/ThemeToggle';
import { ApiClientError, api } from '../services/api';
import { useSession } from '../state/session';

export function LobbyPage() {
  const { session, clearSession, rememberRoom } = useSession();
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
        <div className="header-user"><span className="avatar">{session.alias.slice(0, 1).toUpperCase()}</span><span><small>Alias temporal</small><strong>{session.alias}</strong></span></div>
        <div className="header-actions"><ThemeToggle /><button type="button" className="text-button" onClick={() => { clearSession(); void navigate('/'); }}>Salir</button></div>
      </header>
      <div className="lobby-content">
        <section className="lobby-intro"><div className="eyebrow">ELIGE TU PUERTA</div><h1>¿Dónde quieres <span>garabatear?</span></h1><p>Crea un espacio nuevo o entra con el código que te hayan compartido.</p></section>
        {error !== undefined && <div className="alert alert--error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(undefined)} aria-label="Cerrar">×</button></div>}
        <div className="lobby-grid">
          <form className="panel create-panel" onSubmit={(event) => void create(event)}>
            <div className="panel-icon panel-icon--purple" aria-hidden="true">✦</div>
            <div><h2>Crear una sala</h2><p>Tú decides quién entra y cuándo termina.</p></div>
            <label>Nombre de la sala<input value={roomName} onChange={(event) => setRoomName(event.target.value)} minLength={2} maxLength={48} required /></label>
            <fieldset><legend>Visibilidad</legend><div className="segmented"><label><input type="radio" name="visibility" checked={visibility === 'public'} onChange={() => setVisibility('public')} />Pública</label><label><input type="radio" name="visibility" checked={visibility === 'private'} onChange={() => setVisibility('private')} />Privada</label></div></fieldset>
            {visibility === 'private' && <label>Contraseña <span>(opcional)</span><input type="password" value={createPassword} onChange={(event) => setCreatePassword(event.target.value)} minLength={8} maxLength={128} placeholder="8 caracteres o más" /></label>}
            <label>Máximo de participantes <span>{maxParticipants}</span><input type="range" min="2" max="24" value={maxParticipants} onChange={(event) => setMaxParticipants(Number(event.target.value))} /></label>
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
