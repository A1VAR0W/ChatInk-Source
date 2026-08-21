import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LatestUpdateManifest, UpdateRelease } from '@pictochat/shared';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { UpdateExperience } from './UpdateExperience';
import { UpdateProvider } from './UpdateProvider';
import {
  UpdateCheckError,
  compareVersions,
  decideUpdate,
  fetchUpdateManifest,
  isTrustedManifestUrl,
  updateUrlForPlatform,
  type InstalledVersion,
} from './updateService';

vi.mock('@capacitor/app', () => ({
  App: {
    getInfo: vi.fn(),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));

const installed: InstalledVersion = {
  version: '1.9.0',
  versionCode: 1_009_001,
  platform: 'web',
  source: 'embedded',
  nativeMismatch: false,
};

function release(overrides: Partial<UpdateRelease> = {}): UpdateRelease {
  const version = overrides.version ?? '1.10.0';
  const tag = overrides.tag ?? `v${version}`;
  return {
    tag,
    version,
    versionCode: 1_010_001,
    publishedAt: '2026-08-21T12:00:00.000Z',
    minimumSupportedVersion: null,
    mandatory: false,
    notes: ['Correcciones de estabilidad.'],
    releaseUrl: `https://github.com/A1VAR0W/ChatInk-Releases/releases/tag/${tag}`,
    platforms: {
      android: {
        downloadUrl: `https://github.com/A1VAR0W/ChatInk-Releases/releases/download/${tag}/ChatInk-${version}.apk`,
        sha256: 'a'.repeat(64),
        size: 1_024,
      },
      ios: {
        downloadUrl: `https://github.com/A1VAR0W/ChatInk-Releases/releases/download/${tag}/ChatInk-${version}.ipa`,
        sha256: 'b'.repeat(64),
        size: 2_048,
        sourceUrl: 'https://raw.githubusercontent.com/A1VAR0W/ChatInk-Releases/main/sidestore-source.json',
      },
    },
    ...overrides,
  };
}

function manifest(nextRelease: UpdateRelease | null): LatestUpdateManifest {
  return { schemaVersion: 1, channel: 'stable', release: nextRelease };
}

describe('update service', () => {
  it('compara SemVer numéricamente y rechaza formatos inválidos', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.9.0', '1.9.0')).toBe(0);
    expect(compareVersions('1.8.9', '1.9.0')).toBeLessThan(0);
    expect(() => compareVersions('v1.10.0', '1.9.0')).toThrow(UpdateCheckError);
    expect(() => compareVersions('1.10.0-beta.1', '1.9.0')).toThrow(UpdateCheckError);
  });

  it('no ofrece actualización con release nula, igual o anterior', () => {
    expect(decideUpdate(manifest(null), installed)).toEqual({ kind: 'empty' });
    expect(decideUpdate(manifest(release({ tag: 'v1.9.0', version: '1.9.0', versionCode: 1_009_001 })), installed)).toEqual({ kind: 'current' });
    expect(decideUpdate(manifest(release({ tag: 'v1.8.0', version: '1.8.0', versionCode: 1_008_001 })), installed)).toEqual({ kind: 'current' });
  });

  it('distingue actualizaciones opcionales y obligatorias por mínimo soportado', () => {
    expect(decideUpdate(manifest(release()), installed)).toMatchObject({ kind: 'available', mandatory: false });
    expect(decideUpdate(manifest(release({ mandatory: true })), installed)).toMatchObject({ kind: 'available', mandatory: true });
    expect(decideUpdate(manifest(release({ minimumSupportedVersion: '1.9.1' })), installed)).toMatchObject({ kind: 'available', mandatory: true });
  });

  it('acepta únicamente las URLs públicas exactas y las rutas de cada plataforma', () => {
    expect(isTrustedManifestUrl('https://raw.githubusercontent.com/A1VAR0W/ChatInk-Releases/main/latest.json')).toBe(true);
    expect(isTrustedManifestUrl('https://raw.githubusercontent.com/A1VAR0W/ChatInk-Releases/main/latest.json?cache=1')).toBe(false);
    expect(isTrustedManifestUrl('https://example.test/latest.json')).toBe(false);
    expect(updateUrlForPlatform(release(), 'android')).toContain('.apk');
    expect(updateUrlForPlatform(release(), 'ios')).toContain('sidestore-source.json');
    expect(updateUrlForPlatform(release(), 'web')).toBeUndefined();
  });

  it('trata JSON inválido, timeout y offline como fallos recuperables', async () => {
    await expect(fetchUpdateManifest(
      'https://raw.githubusercontent.com/A1VAR0W/ChatInk-Releases/main/latest.json',
      vi.fn().mockResolvedValue(new Response('{', { status: 200 })),
    )).rejects.toMatchObject({ code: 'invalid-manifest' });

    await expect(fetchUpdateManifest(
      'https://raw.githubusercontent.com/A1VAR0W/ChatInk-Releases/main/latest.json',
      vi.fn().mockRejectedValue(new TypeError('offline')),
    )).rejects.toMatchObject({ code: 'network' });

    await expect(fetchUpdateManifest(
      'https://raw.githubusercontent.com/A1VAR0W/ChatInk-Releases/main/latest.json',
      vi.fn().mockImplementation(() => new Promise<Response>(() => undefined)),
      1,
    )).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('update experience', () => {
  it('recuerda una actualización opcional descartada sin impedir una comprobación manual', async () => {
    const fetchManifest = vi.fn().mockResolvedValue(manifest(release()));
    render(<BrowserRouter><UpdateProvider fetchManifest={fetchManifest}><UpdateExperience /></UpdateProvider></BrowserRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Buscar actualizaciones' }));
    await screen.findByRole('dialog', { name: 'Nueva versión disponible' });
    fireEvent.click(screen.getByRole('button', { name: 'Más tarde' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(localStorage.getItem('chatink.update.dismissed-version')).toBe('1.10.0');

    fireEvent.click(screen.getByRole('button', { name: 'Buscar actualizaciones' }));
    expect(await screen.findByRole('dialog', { name: 'Nueva versión disponible' })).toBeVisible();
  });
});
