import type {
  ApiError,
  RoomAccessResponse,
  RoomSummary,
  SessionResponse,
  UploadResponse,
} from '@pictochat/shared';
import { clientVersionHeaders, reportUnsupportedClient } from '../platform/clientMetadata';

const configuredServerUrl = import.meta.env.VITE_SERVER_URL?.trim();
const productionServerUrl = 'https://chat-ink.tail552c89.ts.net';

// Native bundles cannot use window.location: on a phone that would resolve to
// the Capacitor WebView instead of the home server. Keep an explicit production
// fallback while still allowing deployments to override it at build time.
export const SERVER_URL = (configuredServerUrl || (import.meta.env.PROD ? productionServerUrl : '')).replace(/\/$/, '');

export class ApiClientError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...clientVersionHeaders, ...options.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'No se pudo completar la solicitud', code: 'NETWORK_ERROR' })) as ApiError;
    if (response.status === 426 || data.code === 'CLIENT_VERSION_UNSUPPORTED') reportUnsupportedClient();
    throw new ApiClientError(data.code, data.error, response.status);
  }
  return response.json() as Promise<T>;
}

export const api = {
  createSession: (alias: string) => request<SessionResponse>('/api/sessions', {
    method: 'POST', body: JSON.stringify({ alias }),
  }),
  publicRooms: () => request<{ rooms: RoomSummary[] }>('/api/rooms/public'),
  createRoom: (token: string, input: { name: string; visibility: 'public' | 'private'; password?: string; maxParticipants?: number }) =>
    request<RoomAccessResponse>('/api/rooms', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(input),
    }),
  joinRoom: (token: string, code: string, password?: string) =>
    request<RoomAccessResponse>(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ password }),
    }),
  fileBlob: async (roomId: string, fileId: string, roomToken: string): Promise<Blob> => {
    const response = await fetch(`${SERVER_URL}/api/rooms/${roomId}/files/${fileId}`, {
      headers: { Authorization: `Bearer ${roomToken}`, ...clientVersionHeaders },
    });
    if (!response.ok) throw new ApiClientError('FILE_DOWNLOAD', 'El archivo ya no esta disponible', response.status);
    return response.blob();
  },
};

export interface UploadTask {
  promise: Promise<UploadResponse>;
  cancel: () => void;
}

export function uploadFile(
  roomId: string,
  file: File,
  clientId: string,
  roomToken: string,
  sessionToken: string,
  onProgress: (value: number) => void,
  replyToId?: string,
): UploadTask {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<UploadResponse>((resolve, reject) => {
    xhr.open('POST', `${SERVER_URL}/api/rooms/${roomId}/files`);
    xhr.setRequestHeader('Authorization', `Bearer ${roomToken}`);
    xhr.setRequestHeader('X-Session-Token', sessionToken);
    for (const [header, value] of Object.entries(clientVersionHeaders)) xhr.setRequestHeader(header, value);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener('load', () => {
      const data = JSON.parse(xhr.responseText || '{}') as UploadResponse & ApiError;
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        if (xhr.status === 426 || data.code === 'CLIENT_VERSION_UNSUPPORTED') reportUnsupportedClient();
        reject(new ApiClientError(data.code ?? 'UPLOAD_FAILED', data.error ?? 'No se pudo subir el archivo', xhr.status));
      }
    });
    xhr.addEventListener('error', () => reject(new ApiClientError('NETWORK_ERROR', 'Se perdio la conexion durante la subida', 0)));
    xhr.addEventListener('abort', () => reject(new ApiClientError('UPLOAD_CANCELLED', 'Subida cancelada', 0)));
    const form = new FormData();
    form.append('clientId', clientId);
    if (replyToId !== undefined) form.append('replyToId', replyToId);
    form.append('file', file, file.name);
    xhr.send(form);
  });
  return { promise, cancel: () => xhr.abort() };
}
