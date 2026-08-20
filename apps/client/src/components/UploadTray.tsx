import { formatBytes } from '@pictochat/shared';

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'done' | 'error' | 'cancelled';
  error?: string;
  cancel: () => void;
}

export function UploadTray({ uploads, dismiss }: { uploads: UploadItem[]; dismiss: (id: string) => void }) {
  if (uploads.length === 0) return null;
  return (
    <aside className="upload-tray" aria-label="Subidas">
      {uploads.map((upload) => (
        <div className="upload-item" key={upload.id}>
          <div><strong>{upload.name}</strong><small>{formatBytes(upload.size)} · {upload.status === 'uploading' ? `${upload.progress}%` : upload.status === 'done' ? 'Listo' : upload.error ?? 'Cancelado'}</small></div>
          <progress max="100" value={upload.progress} aria-label={`Subida de ${upload.name}`} />
          {upload.status === 'uploading'
            ? <button type="button" onClick={upload.cancel}>Cancelar</button>
            : <button type="button" onClick={() => dismiss(upload.id)} aria-label={`Ocultar ${upload.name}`}>×</button>}
        </div>
      ))}
    </aside>
  );
}
