import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import type { DrawingParticipant, RoomMessage, TypingParticipant } from '@pictochat/shared';
import { useNavigate, useParams } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { Avatar } from '../components/Avatar';
import { ChatComposer } from '../components/ChatComposer';
import { CanvasIcon, ExitIcon, PeopleIcon } from '../components/Icons';
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

function typingLabel(participants: TypingParticipant[]): string | undefined {
  if (participants.length === 0) return undefined;
  if (participants.length === 1) return `${participants[0]?.alias} está escribiendo`;
  if (participants.length === 2) return `${participants[0]?.alias} y ${participants[1]?.alias} están escribiendo`;
  return `${participants[0]?.alias} y ${participants.length - 1} más están escribiendo`;
}

function drawingLabel(participants: DrawingParticipant[]): string | undefined {
  if (participants.length === 0) return undefined;
  if (participants.length === 1) return `${participants[0]?.alias} está dibujando`;
  if (participants.length === 2) return `${participants[0]?.alias} y ${participants[1]?.alias} están dibujando`;
  return `${participants[0]?.alias} y ${participants.length - 1} más están dibujando`;
}

function ActivityIndicator({ participants, activity }: { participants: TypingParticipant[] | DrawingParticipant[]; activity: 'typing' | 'drawing' }) {
  const label = activity === 'typing' ? typingLabel(participants) : drawingLabel(participants);
  const first = participants[0];
  if (label === undefined || first === undefined) return null;
  return (
    <div className="typing-indicator typing-indicator--active" role="status" aria-live="polite" aria-atomic="true">
      <Avatar alias={first.alias} label={false} />
      <span>{label}</span>
      {activity === 'typing'
        ? <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
        : <CanvasIcon aria-hidden="true" />}
    </div>
  );
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
  const { leaveRoom } = realtime;
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [replyTo, setReplyTo] = useState<RoomMessage>();
  const [composerMode, setComposerMode] = useState<'text' | 'drawing'>('text');
  const maxFileBytes = Number(import.meta.env.VITE_MAX_FILE_BYTES ?? 26_214_400);
  const inviteUrl = useMemo(() => {
    const publicAppUrl = (import.meta.env.VITE_PUBLIC_APP_URL?.trim() || (import.meta.env.PROD ? 'https://chat-ink.tail552c89.ts.net' : window.location.origin)).replace(/\/$/, '');
    return `${publicAppUrl}/?room=${access.room.code}`;
  }, [access.room.code]);

  const leftRoom = useRef(false);
  const leaveAccess = useCallback(() => {
    if (leftRoom.current) return;
    leftRoom.current = true;
    leaveRoom();
    forgetRoom(roomId);
  }, [forgetRoom, leaveRoom, roomId]);
  const leave = useCallback(() => {
    leaveAccess();
    void navigate('/lobby');
  }, [leaveAccess, navigate]);
  const leaveAccessRef = useRef(leaveAccess);
  useEffect(() => {
    leaveAccessRef.current = leaveAccess;
  }, [leaveAccess]);
  useEffect(() => {
    const leaveOnPageHide = () => leaveAccessRef.current();
    const leaveOnBrowserBack = () => leaveAccessRef.current();
    window.addEventListener('pagehide', leaveOnPageHide);
    window.addEventListener('popstate', leaveOnBrowserBack);
    return () => {
      window.removeEventListener('pagehide', leaveOnPageHide);
      window.removeEventListener('popstate', leaveOnBrowserBack);
    };
  }, []);
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); } catch { /* El codigo visible sigue disponible. */ }
  };
  const close = async () => {
    if (!window.confirm('Cerrar la sala eliminará inmediatamente mensajes y archivos. ¿Continuar?')) return;
    const result = await realtime.closeRoom();
    if (!result.ok) window.alert(result.message);
  };
  const startUploads = (files: FileList, replyToId?: string) => {
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      if (file.size > maxFileBytes) {
        setUploads((current) => [...current, { id, name: file.name, size: file.size, progress: 0, status: 'error', error: 'Supera el límite permitido', cancel: () => undefined }]);
        continue;
      }
      const task = uploadFile(roomId, file, id, access.roomToken, session.token, (progress) => {
        setUploads((current) => current.map((item) => item.id === id ? { ...item, progress } : item));
      }, replyToId);
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
  const selectReply = useCallback((message: RoomMessage) => {
    setReplyTo(message);
    setComposerMode('text');
  }, []);
  const activeTypingLabel = typingLabel(realtime.typingParticipants);
  const activeDrawingLabel = drawingLabel(realtime.drawingParticipants);
  const drawingParticipantIds = useMemo(() => new Set(realtime.drawingParticipants.map((participant) => participant.id)), [realtime.drawingParticipants]);

  return (
    <main className="room-page">
      <header className="room-header">
        <button type="button" className="icon-button back-button" onClick={leave} aria-label="Salir de la sala">←</button>
        <Brand compact />
        <div className="room-identity"><strong>{access.room.name}</strong><button type="button" onClick={() => void copyInvite()} title="Copiar invitación"><code>{access.room.code}</code><span>Copiar</span></button></div>
        <div className={`connection connection--${realtime.status}`}><i />{statusLabel(realtime.status)}</div>
        <Popover.Root>
          <Popover.Trigger className="people-button" aria-label={`Ver ${realtime.participants.length} personas en la sala`}><PeopleIcon /><span>{realtime.participants.length}</span></Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner sideOffset={10} align="end">
              <Popover.Popup className="participants-popover" aria-label="Personas en la sala">
                <div className="participants-title"><div><Popover.Title>En la sala</Popover.Title><span>{realtime.participants.length}/{access.room.maxParticipants}</span></div><Popover.Close className="icon-button" aria-label="Cerrar participantes">×</Popover.Close></div>
                <ul>{realtime.participants.map((participant) => <li key={participant.id}><Avatar alias={participant.alias} /><div><strong>{participant.id === session.sessionId ? `${participant.alias} (tú)` : participant.alias}</strong><small>{participant.isCreator ? 'Creador/a' : 'Participante'}</small>{drawingParticipantIds.has(participant.id) && <small className="participant-activity"><CanvasIcon />Dibujando</small>}</div><i className="online-dot" title="En línea" /></li>)}</ul>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        <ThemeToggle />
        {access.role === 'creator' && <button type="button" className="icon-button close-room-button" onClick={() => void close()} aria-label="Cerrar sala" title="Cerrar sala"><ExitIcon /></button>}
      </header>

      {realtime.status === 'reconnecting' && <div className="offline-banner">Reconectando… Tus mensajes no se duplicarán.</div>}
      {realtime.error !== undefined && <div className="alert alert--error room-alert" role="alert"><span>{realtime.error}</span><button type="button" onClick={realtime.clearError} aria-label="Cerrar">×</button></div>}

      <div className="room-layout">
        <section className={`chat-area ${composerMode === 'drawing' ? 'chat-area--drawing' : ''}`}>
          <div className="history"><MessageList messages={realtime.messages} ownId={session.sessionId} roomToken={access.roomToken} onReply={selectReply} /></div>
          <UploadTray uploads={uploads} dismiss={(id) => setUploads((current) => current.filter((item) => item.id !== id))} />
          {activeTypingLabel !== undefined && <ActivityIndicator participants={realtime.typingParticipants} activity="typing" />}
          {activeDrawingLabel !== undefined && <ActivityIndicator participants={realtime.drawingParticipants} activity="drawing" />}
          <ChatComposer
            disabled={realtime.status !== 'connected'}
            mode={composerMode}
            {...(replyTo === undefined ? {} : { replyTo })}
            onText={realtime.sendText}
            onDrawing={realtime.sendDrawing}
            onFiles={startUploads}
            onCancelReply={() => setReplyTo(undefined)}
            onTypingChange={realtime.setTyping}
            onDrawingActivityChange={realtime.setDrawing}
            onModeChange={setComposerMode}
          />
        </section>
      </div>

      {realtime.closedReason !== undefined && <div className="modal-backdrop"><div className="modal-card closed-card" role="alertdialog" aria-modal="true"><span className="closed-icon" aria-hidden="true">⌁</span><h2>Esta sala ya no está</h2><p>{realtime.closedReason}</p><p>Los mensajes, dibujos y archivos asociados se han eliminado a nivel de aplicación.</p><button type="button" className="button" onClick={leave}>Volver al vestíbulo</button></div></div>}
    </main>
  );
}
