import { lazy, Suspense } from 'react';
import { IonApp } from '@ionic/react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EntryPage } from './pages/EntryPage';
import { RegisterPage } from './pages/RegisterPage';
import { InputFocusManager } from './components/InputFocusManager';
import { SessionProvider, useSession } from './state/session';
import { MessageTextSizeProvider } from './state/messageTextSize';
import { UpdateProvider } from './updates/UpdateProvider';

const LobbyPage = lazy(() => import('./pages/LobbyPage').then((module) => ({ default: module.LobbyPage })));
const RoomPage = lazy(() => import('./pages/RoomPage').then((module) => ({ default: module.RoomPage })));

function ProtectedLobby() {
  const { session, restoringAccount } = useSession();
  if (restoringAccount) return <div className="app-loading" role="status">Recuperando tu sesión…</div>;
  return session === undefined ? <Navigate to="/" replace /> : <LobbyPage />;
}

export function App() {
  return (
    <IonApp>
      <UpdateProvider>
        <MessageTextSizeProvider>
          <SessionProvider>
            <InputFocusManager />
            <BrowserRouter>
              <Suspense fallback={<div className="app-loading" role="status">Preparando la sala…</div>}>
                <Routes>
                  <Route path="/" element={<EntryPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/lobby" element={<ProtectedLobby />} />
                  <Route path="/room/:roomId" element={<RoomPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </SessionProvider>
        </MessageTextSizeProvider>
      </UpdateProvider>
    </IonApp>
  );
}
