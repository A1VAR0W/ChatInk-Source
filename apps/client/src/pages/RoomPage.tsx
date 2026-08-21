import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { ChatComposer } from '../components/ChatComposer';
import { MessageList } from '../components/MessageList';
import { ThemeToggle } from '../components/ThemeToggle';
import { UploadTray, type UploadItem } from '../components/UploadTray';
import { useRoomSocket } from '../hooks/useRoomSocket';
import { ApiClientError, uploadFile } from '../services/api';
import { useSession } from '../state/session';

function statusLabel(status: ReturnType<typeof useRoomSocket>['status']) {
  if (status === 'connected') return 'Conectado';
  if (status === 'connecting') return 'Conectando';
  if (status === 'reconnecting') return 'Reconectando';
  if (status === 'closed') return 'Sala cerrada';
  return 'Sin conexión';
}

export function RoomPage() {
  const { roomId = '' } = useParams();
  const { session, roomAccess } = useSession();
  const access = roomAccess(roomId);
  if (session === undefined || access === undefined) return <MissingRoom />;
  return <ActiveRoom roomId={roomId} />;
}

function MissingRoom() {
  const navigate = useNavigate();
  return <main className="missing-page"><Brand /><h1>No tenemos acceso a esta sala</h1><p>La autorización era temporal o la sala ya no existe.</p><button type="button" className="button" onClick={() => void navigate('/lobby')}>Volver al inicio</button></main>;
}

function ActiveRoom({ roomId }: { roomId: string }) {
  const { session, roomAccess, forgetRoom } = useSession();
  const access = roomAccess(roomId);
  if (session === undefined || access === undefined) throw new Error('Acceso de sala no disponible');
  const navigate = useNavigate();
  const realtime = useRoomSocket(access, session);
  const [showPeople, setShowPeople] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const maxFileBytes = Number(import.meta.env.VITE_MAX_FILE_BYTES ?? 26_214_400);
  const inviteUrl = useMemo(() => {
    const publicAppUrl = (import.meta.env.VITE_PUBLIC_APP_URL?.trim() || (import.meta.env.PROD ? 'https://chat-ink.tail552c89.ts.net' : window.location.origin)).replace(/\/$/, '');
    return `${publicAppUrl}/?room=${access.room.code}`;
  }, [access.room.code]);

  const leave = () => {
    forgetRoom(roomId);
    void navigate('/lobby');
  };
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); } catch { /* El codigo visible sigue disponible. */ }
  };
  const close = async () => {
    if (!window.confirm('Cerrar la sala eliminará inmediatamente mensajes y archivos. ¿Continuar?')) return;
    const result = await realtime.closeRoom();
    if (!result.ok) window.alert(result.message);
  };
  const startUploads = (files: FileList) => {
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      if (file.size > maxFileBytes) {
        setUploads((current) => [...current, { id, name: file.name, size: file.size, progress: 0, status: 'error', error: 'Supera el límite permitido', cancel: () => undefined }]);
        continue;
      }
      const task = uploadFile(roomId, file, id, access.roomToken, session.token, (progress) => {
        setUploads((current) => current.map((item) => item.id === id ? { ...item, progress } : item));
      });
      setUploads((current) => [...current, { id, name: file.name, size: file.size, progress: 0, status: 'uploading', cancel: task.cancel }]);
      void task.promise
        .then(() => setUploads((current) => current.map((item) => item.id === id ? { ...item, progress: 100, status: 'done' } : item)))
        .catch((error: unknown) => setUploads((current) => current.map((item) => item.id === id ? {
          ...item,
          status: error instanceof ApiClientError && error.code === 'UPLOAD_CANCELLED' ? 'cancelled' : 'error',
          error: error instanceof Error ? error.message : 'Error de subida',
        } : item)));
    }
  };

  return (
    <main className="room-page">
      <header className="room-header">
        <button type="button" className="icon-button back-button" onClick={leave} aria-label="Salir de la sala">←</button>
        <Brand compact />
        <div className="room-identity"><strong>{access.room.name}</strong><button type="button" onClick={() => void copyInvite()} title="Copiar invitación"><code>{access.room.code}</code><span>Copiar</span></button></div>
        <div className={`connection connection--${realtime.status}`}><i />{statusLabel(realtime.status)}</div>
        <button type="button" className="people-button" onClick={() => setShowPeople((value) => !value)} aria-expanded={showPeople}><span aria-hidden="true">◉</span>{realtime.participants.length}</button>
        <ThemeToggle />
        {access.role === 'creator' && <button type="button" className="text-button danger" onClick={() => void close()}>Cerrar sala</button>}
      </header>

      {realtime.status === 'reconnecting' && <div className="offline-banner">Reconectando… Tus mensajes no se duplicarán.</div>}
      {realtime.error !== undefined && <div className="alert alert--error room-alert" role="alert"><span>{realtime.error}</span><button type="button" onClick={realtime.clearError} aria-label="Cerrar">×</button></div>}

      <div className="room-layout">
        <section className="chat-area">
          <div className="history"><MessageList messages={realtime.messages} ownId={session.sessionId} roomToken={access.roomToken} /></div>
          <UploadTray uploads={uploads} dismiss={(id) => setUploads((current) => current.filter((item) => item.id !== id))} />
          <ChatComposer disabled={realtime.status !== 'connected'} onText={realtime.sendText} onDrawing={realtime.sendDrawing} onFiles={startUploads} />
        </section>
        <aside className={`participants-panel ${showPeople ? 'participants-panel--open' : ''}`}>
          <div className="participants-title"><div><h2>En la sala</h2><span>{realtime.participants.length}/{access.room.maxParticipants}</span></div><button type="button" className="icon-button panel-close" onClick={() => setShowPeople(false)} aria-label="Cerrar participantes">×</button></div>
          <ul>{realtime.participants.map((participant) => <li key={participant.id}><span className="avatar">{participant.alias.slice(0, 1).toUpperCase()}</span><div><strong>{participant.id === session.sessionId ? `${participant.alias} (tú)` : participant.alias}</strong><small>{participant.isCreator ? 'Creador/a' : 'Participante'}</small></div><i className="online-dot" title="En línea" /></li>)}</ul>
          <div className="expiry-note"><span aria-hidden="true">⌛</span><p><strong>Sala temporal</strong><br />Caduca como máximo el {new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' }).format(access.room.expiresAt)}.</p></div>
        </aside>
      </div>

      {realtime.closedReason !== undefined && <div className="modal-backdrop"><div className="modal-card closed-card" role="alertdialog" aria-modal="true"><span className="closed-icon" aria-hidden="true">⌁</span><h2>Esta sala ya no está</h2><p>{realtime.closedReason}</p><p>Los mensajes, dibujos y archivos asociados se han eliminado a nivel de aplicación.</p><button type="button" className="button" onClick={leave}>Volver al vestíbulo</button></div></div>}
    </main>
  );
}
