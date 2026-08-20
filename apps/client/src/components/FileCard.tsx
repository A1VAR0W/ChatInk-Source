import { useEffect, useState } from 'react';
import { formatBytes, type FilePayload } from '@pictochat/shared';
import { api } from '../services/api';

function previewable(mime: string): boolean {
  return mime.startsWith('image/') || mime === 'video/mp4' || mime === 'video/webm';
}

export function FileCard({ file, roomId, roomToken }: { file: FilePayload; roomId: string; roomToken: string }) {
  const [objectUrl, setObjectUrl] = useState<string>();
  const [previewError, setPreviewError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!previewable(file.mime)) return;
    let active = true;
    let url: string | undefined;
    void api.fileBlob(roomId, file.id, roomToken)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => { if (active) setPreviewError(true); });
    return () => {
      active = false;
      if (url !== undefined) URL.revokeObjectURL(url);
    };
  }, [file.id, file.mime, roomId, roomToken]);

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await api.fileBlob(roomId, file.id, roomToken);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setPreviewError(true);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="file-card">
      {objectUrl !== undefined && file.mime.startsWith('image/') && <img src={objectUrl} alt={`Vista previa de ${file.name}`} />}
      {objectUrl !== undefined && file.mime.startsWith('video/') && <video src={objectUrl} controls preload="metadata" aria-label={`Vista previa de ${file.name}`} />}
      {objectUrl === undefined && previewable(file.mime) && !previewError && <div className="file-skeleton">Preparando vista previa…</div>}
      <div className="file-info">
        <span className="file-icon" aria-hidden="true">{file.mime.startsWith('image/') ? '▧' : file.mime.startsWith('video/') ? '▶' : '▤'}</span>
        <div><strong title={file.name}>{file.name}</strong><small>{file.mime} · {formatBytes(file.size)}</small></div>
        <button type="button" className="button button--small button--secondary" onClick={() => void download()} disabled={downloading}>
          {downloading ? 'Descargando…' : 'Descargar'}
        </button>
      </div>
      {previewError && <small className="error-text">Este archivo temporal ya no está disponible.</small>}
    </div>
  );
}
