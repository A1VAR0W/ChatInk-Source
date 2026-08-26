import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Avatar } from './Avatar';
import { ApiClientError, api, type FriendSummary } from '../services/api';

interface FriendsDrawerProps {
  open: boolean;
  onClose: () => void;
  accountToken?: string | undefined;
}

function messageFor(error: unknown) {
  return error instanceof ApiClientError ? error.message : 'No se pudieron cargar tus amistades';
}

export function FriendsDrawer({ open, onClose, accountToken }: FriendsDrawerProps) {
  const titleId = useId();
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    if (accountToken === undefined) return;
    setLoading(true);
    setError(undefined);
    try {
      setFriends((await api.friends(accountToken)).friends);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || accountToken === undefined) return;
    const loadTimer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(loadTimer);
  // La apertura es la única acción que debe disparar una carga nueva.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accountToken]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, onClose]);

  const request = async (event: FormEvent) => {
    event.preventDefault();
    if (accountToken === undefined || username.trim().length < 2) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await api.requestFriend(accountToken, username.trim());
      setUsername('');
      await refresh();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const accept = async (friendshipId: string) => {
    if (accountToken === undefined) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await api.acceptFriend(accountToken, friendshipId);
      await refresh();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTier = async (friend: FriendSummary) => {
    if (accountToken === undefined) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await api.setFriendTier(accountToken, friend.id, friend.tier === 'close' ? 'normal' : 'close');
      await refresh();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const accepted = friends.filter((friend) => friend.status === 'accepted');
  const incoming = friends.filter((friend) => friend.status === 'pending' && !friend.requestedByMe);
  const outgoing = friends.filter((friend) => friend.status === 'pending' && friend.requestedByMe);

  return (
    <div className="friends-layer" data-open={open} aria-hidden={!open}>
      <button type="button" className="friends-layer__backdrop" onClick={onClose} tabIndex={open ? 0 : -1} aria-label="Cerrar Amigos" />
      <aside className="friends-drawer" role="dialog" aria-modal={open} aria-labelledby={titleId} inert={!open ? true : undefined}>
        <header className="friends-drawer__header"><div><span className="eyebrow">TU CÍRCULO</span><h2 id={titleId}>Amigos</h2></div><button type="button" className="icon-button" onClick={onClose} tabIndex={open ? 0 : -1} aria-label="Cerrar Amigos">×</button></header>
        {accountToken === undefined ? (
          <div className="friends-empty"><span aria-hidden="true">⌁</span><h3>Solo para cuentas</h3><p>Inicia sesión con tu correo para guardar amistades y distinguir tus contactos cercanos.</p></div>
        ) : (
          <div className="friends-drawer__content">
            <form className="friend-add" onSubmit={(event) => void request(event)}><label htmlFor="friend-username">Añadir por usuario</label><div><input id="friend-username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={2} maxLength={24} placeholder="Nombre de usuario" disabled={!open || submitting} /><button className="button button--small" type="submit" disabled={submitting || username.trim().length < 2}>Añadir</button></div></form>
            {error !== undefined && <p className="error-text friends-error" role="alert">{error}</p>}
            {loading ? <p className="friends-status" role="status">Cargando amistades…</p> : <>
              {incoming.length > 0 && <FriendGroup title="Solicitudes para ti">{incoming.map((friend) => <FriendRow key={friend.id} friend={friend} action={<button className="button button--small" type="button" disabled={submitting} onClick={() => void accept(friend.friendshipId)}>Aceptar</button>} />)}</FriendGroup>}
              {accepted.length > 0 && <FriendGroup title="Tus amigos">{accepted.map((friend) => <FriendRow key={friend.id} friend={friend} action={<button className="friend-tier" type="button" disabled={submitting} onClick={() => void toggleTier(friend)}>{friend.tier === 'close' ? 'Cercano' : 'Normal'}</button>} />)}</FriendGroup>}
              {outgoing.length > 0 && <FriendGroup title="Solicitudes enviadas">{outgoing.map((friend) => <FriendRow key={friend.id} friend={friend} action={<span className="friend-pending">Pendiente</span>} />)}</FriendGroup>}
              {friends.length === 0 && <div className="friends-empty"><span aria-hidden="true">✦</span><h3>Tu lista está vacía</h3><p>Añade a alguien por su nombre de usuario. Podrás marcar como cercanos a los contactos importantes.</p></div>}
            </>}
          </div>
        )}
      </aside>
    </div>
  );
}

function FriendGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className="friend-group"><h3>{title}</h3><ul>{children}</ul></section>;
}

function FriendRow({ friend, action }: { friend: FriendSummary; action: ReactNode }) {
  return <li><Avatar alias={friend.username} /><strong>{friend.username}</strong>{action}</li>;
}
