import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, join, parse, relative, resolve } from 'node:path';

function assertSafeRoot(root: string): void {
  const target = resolve(root);
  const forbidden = new Set([parse(target).root, resolve(process.cwd()), resolve(homedir()), resolve(tmpdir())]);
  if (forbidden.has(target) || basename(target).length < 3) {
    throw new Error('TEMP_ROOT apunta a un directorio demasiado amplio');
  }
}

function assertInside(root: string, target: string): void {
  const pathFromRoot = relative(root, target);
  if (pathFromRoot === '' || pathFromRoot.startsWith('..') || pathFromRoot.includes(':')) {
    throw new Error('Ruta temporal no valida');
  }
}

function assertOpaqueId(value: string): void {
  if (!/^[0-9a-f-]{36}$/.test(value)) throw new Error('Identificador temporal no valido');
}

export class TempStorage {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
    assertSafeRoot(this.root);
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const entries = await readdir(this.root, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const child = join(this.root, entry.name);
        assertInside(this.root, child);
        await rm(child, { recursive: true, force: true });
      }),
    );
  }

  async partialPath(roomId: string, fileId: string): Promise<string> {
    assertOpaqueId(roomId);
    assertOpaqueId(fileId);
    const roomDirectory = join(this.root, roomId);
    assertInside(this.root, roomDirectory);
    await mkdir(roomDirectory, { recursive: true, mode: 0o700 });
    const target = join(roomDirectory, `${fileId}.part`);
    assertInside(this.root, target);
    return target;
  }

  finalPath(roomId: string, fileId: string): string {
    assertOpaqueId(roomId);
    assertOpaqueId(fileId);
    const target = join(this.root, roomId, `${fileId}.bin`);
    assertInside(this.root, target);
    return target;
  }

  async finalize(partialPath: string, roomId: string, fileId: string): Promise<string> {
    assertInside(this.root, partialPath);
    const target = this.finalPath(roomId, fileId);
    await rename(partialPath, target);
    return target;
  }

  async removeFile(path: string): Promise<void> {
    assertInside(this.root, path);
    await rm(path, { force: true });
  }

  async removeRoom(roomId: string): Promise<void> {
    assertOpaqueId(roomId);
    const target = join(this.root, roomId);
    assertInside(this.root, target);
    await rm(target, { recursive: true, force: true });
  }

  async cleanupOrphans(activeRoomIds: Set<string>, olderThanMs: number, now = Date.now()): Promise<void> {
    const entries = await readdir(this.root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || activeRoomIds.has(entry.name)) continue;
      const target = join(this.root, entry.name);
      assertInside(this.root, target);
      const metadata = await stat(target);
      if (now - metadata.mtimeMs >= olderThanMs) await rm(target, { recursive: true, force: true });
    }
  }

  async shutdown(): Promise<void> {
    await this.initialize();
  }
}

export function safeDownloadName(value: string): string {
  const withoutControls = Array.from(basename(value), (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? '_' : character;
  }).join('');
  const cleaned = withoutControls
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'archivo';
}

export function contentDisposition(name: string): string {
  const ascii = safeDownloadName(name).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safeDownloadName(name))}`;
}
