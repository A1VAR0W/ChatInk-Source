import { open } from 'node:fs/promises';
import { fileTypeFromFile } from 'file-type';

const allowedMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
]);

async function looksLikeText(path: string): Promise<boolean> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const sample = buffer.subarray(0, bytesRead);
    if (sample.includes(0)) return false;
    new TextDecoder('utf-8', { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  } finally {
    await handle.close();
  }
}

export async function detectAllowedMime(path: string): Promise<string | undefined> {
  const detected = await fileTypeFromFile(path);
  if (detected !== undefined && allowedMimes.has(detected.mime)) return detected.mime;
  if (detected === undefined && (await looksLikeText(path))) return 'text/plain';
  return undefined;
}

export function isPreviewableMime(mime: string): boolean {
  return mime.startsWith('image/') || mime === 'video/mp4' || mime === 'video/webm';
}
