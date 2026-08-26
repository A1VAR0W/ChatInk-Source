import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { latestUpdateManifestSchema, stableVersionPattern, type LatestUpdateManifest, type UpdateChannel, type UpdateRelease } from '@pictochat/shared';

export const DEFAULT_UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/A1VAR0W/ChatInk-Releases/main/latest.json';
export const PREPRODUCTION_UPDATE_MANIFEST_URL = 'https://chat-ink.tail552c89.ts.net:8443/preproduction-update.json';
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;
export const UPDATE_REQUEST_TIMEOUT_MS = 8_000;

export type UpdatePlatform = 'web' | 'android' | 'ios';
export type InstalledVersion = {
  version: string;
  versionCode: number;
  platform: UpdatePlatform;
  source: 'embedded' | 'native';
  nativeMismatch: boolean;
};

export type UpdateDecision =
  | { kind: 'available'; release: UpdateRelease; mandatory: boolean }
  | { kind: 'current' }
  | { kind: 'empty' };

export class UpdateCheckError extends Error {
  constructor(readonly code: 'invalid-url' | 'timeout' | 'network' | 'invalid-manifest' | 'untrusted-release') {
    super(code);
  }
}

function parseVersion(version: string): [number, number, number] {
  const match = stableVersionPattern.exec(version);
  if (match === null) throw new UpdateCheckError('invalid-manifest');
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (leftParts[0] !== rightParts[0]) return leftParts[0] > rightParts[0] ? 1 : -1;
  if (leftParts[1] !== rightParts[1]) return leftParts[1] > rightParts[1] ? 1 : -1;
  if (leftParts[2] !== rightParts[2]) return leftParts[2] > rightParts[2] ? 1 : -1;
  return 0;
}

function versionCode(version: string): number {
  const [major, minor, patch] = parseVersion(version);
  return major * 1_000_000 + minor * 1_000 + patch + 1;
}

function expectedUrl(value: string, host: string, path: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host && url.pathname === path && url.username === '' && url.password === '' && url.search === '' && url.hash === '';
  } catch {
    return false;
  }
}

export function isTrustedManifestUrl(value: string): boolean {
  return expectedUrl(value, 'raw.githubusercontent.com', '/A1VAR0W/ChatInk-Releases/main/latest.json')
    || expectedUrl(value, 'chat-ink.tail552c89.ts.net', '/preproduction-update.json');
}

function trustedChannelForManifestUrl(value: string): UpdateChannel | undefined {
  if (expectedUrl(value, 'raw.githubusercontent.com', '/A1VAR0W/ChatInk-Releases/main/latest.json')) return 'stable';
  if (expectedUrl(value, 'chat-ink.tail552c89.ts.net', '/preproduction-update.json')) return 'preproduction';
  return undefined;
}

export function assertTrustedRelease(release: UpdateRelease, channel: UpdateChannel = 'stable'): void {
  const repositoryPath = channel === 'preproduction' ? '/A1VAR0W/ChatInk-Source' : '/A1VAR0W/ChatInk-Releases';
  const tag = encodeURIComponent(release.tag);
  const version = encodeURIComponent(release.version);
  if (release.tag !== `v${release.version}` || release.versionCode !== versionCode(release.version)) {
    throw new UpdateCheckError('untrusted-release');
  }
  if (!expectedUrl(release.releaseUrl, 'github.com', `${repositoryPath}/releases/tag/${tag}`)) {
    throw new UpdateCheckError('untrusted-release');
  }
  const preproductionAndroidAsset = expectedUrl(release.platforms.android.downloadUrl, 'chat-ink.tail552c89.ts.net', `/preproduction-builds/ChatInk-${version}.apk`);
  const preproductionIosAsset = expectedUrl(release.platforms.ios.downloadUrl, 'chat-ink.tail552c89.ts.net', `/preproduction-builds/ChatInk-${version}.ipa`);
  if (!(channel === 'preproduction' && preproductionAndroidAsset) && !expectedUrl(release.platforms.android.downloadUrl, 'github.com', `${repositoryPath}/releases/download/${tag}/ChatInk-${version}.apk`)) {
    throw new UpdateCheckError('untrusted-release');
  }
  if (!(channel === 'preproduction' && preproductionIosAsset) && !expectedUrl(release.platforms.ios.downloadUrl, 'github.com', `${repositoryPath}/releases/download/${tag}/ChatInk-${version}.ipa`)) {
    throw new UpdateCheckError('untrusted-release');
  }
  const trustedIosSource = channel === 'preproduction'
    ? expectedUrl(release.platforms.ios.sourceUrl, 'chat-ink.tail552c89.ts.net', '/preproduction-sidestore-source.json')
    : expectedUrl(release.platforms.ios.sourceUrl, 'raw.githubusercontent.com', '/A1VAR0W/ChatInk-Releases/main/sidestore-source.json');
  if (!trustedIosSource) {
    throw new UpdateCheckError('untrusted-release');
  }
}

export function decideUpdate(manifest: LatestUpdateManifest, installed: InstalledVersion): UpdateDecision {
  if (manifest.release === null) return { kind: 'empty' };
  assertTrustedRelease(manifest.release, manifest.channel);
  const mandatory = manifest.release.mandatory
    || (manifest.release.minimumSupportedVersion !== null && compareVersions(installed.version, manifest.release.minimumSupportedVersion) < 0);
  if (mandatory) return { kind: 'available', release: manifest.release, mandatory: true };
  if (compareVersions(manifest.release.version, installed.version) <= 0) return { kind: 'current' };
  return { kind: 'available', release: manifest.release, mandatory };
}

export async function fetchUpdateManifest(
  manifestUrl = import.meta.env.VITE_UPDATE_MANIFEST_URL || DEFAULT_UPDATE_MANIFEST_URL,
  fetcher: typeof fetch = fetch,
  timeoutMs = UPDATE_REQUEST_TIMEOUT_MS,
): Promise<LatestUpdateManifest> {
  const channel = trustedChannelForManifestUrl(manifestUrl);
  if (channel === undefined) throw new UpdateCheckError('invalid-url');
  const controller = new AbortController();
  let rejectForTimeout: ((reason: UpdateCheckError) => void) | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    rejectForTimeout = reject as (reason: UpdateCheckError) => void;
  });
  const timeout = window.setTimeout(() => {
    controller.abort();
    rejectForTimeout?.(new UpdateCheckError('timeout'));
  }, timeoutMs);
  try {
    const response = await Promise.race([fetcher(manifestUrl, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    }), timeoutPromise]);
    if (!response.ok) throw new UpdateCheckError('network');
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new UpdateCheckError('invalid-manifest');
    }
    const parsed = latestUpdateManifestSchema.safeParse(body);
    if (!parsed.success || parsed.data.channel !== channel) throw new UpdateCheckError('invalid-manifest');
    if (parsed.data.release !== null) assertTrustedRelease(parsed.data.release, parsed.data.channel);
    return parsed.data;
  } catch (error) {
    if (error instanceof UpdateCheckError) throw error;
    if (controller.signal.aborted) throw new UpdateCheckError('timeout');
    throw new UpdateCheckError('network');
  } finally {
    window.clearTimeout(timeout);
  }
}

function embeddedVersion(): InstalledVersion {
  const version = import.meta.env.VITE_APP_VERSION || '0.1.0';
  const parsedCode = Number(import.meta.env.VITE_APP_VERSION_CODE || versionCode(version));
  const platform = Capacitor.getPlatform();
  return {
    version,
    versionCode: Number.isSafeInteger(parsedCode) && parsedCode > 0 ? parsedCode : versionCode(version),
    platform: platform === 'android' || platform === 'ios' ? platform : 'web',
    source: 'embedded',
    nativeMismatch: false,
  };
}

export async function readInstalledVersion(): Promise<InstalledVersion> {
  const embedded = embeddedVersion();
  if (embedded.platform === 'web') return embedded;
  try {
    const info = await App.getInfo();
    if (!stableVersionPattern.test(info.version)) return embedded;
    const nativeCode = Number(info.build);
    return {
      version: info.version,
      versionCode: Number.isSafeInteger(nativeCode) && nativeCode > 0 ? nativeCode : embedded.versionCode,
      platform: embedded.platform,
      source: 'native',
      nativeMismatch: info.version !== embedded.version || (Number.isSafeInteger(nativeCode) && nativeCode !== embedded.versionCode),
    };
  } catch {
    return embedded;
  }
}

export function automaticChecksEnabled(): boolean {
  if (import.meta.env.VITE_ENABLE_UPDATE_CHECKS === 'false') return false;
  return !import.meta.env.DEV || import.meta.env.VITE_ENABLE_UPDATE_CHECKS === 'true';
}

export function updateUrlForPlatform(release: UpdateRelease, platform: UpdatePlatform): string | undefined {
  if (platform === 'android') return release.platforms.android.downloadUrl;
  if (platform === 'ios') return release.platforms.ios.sourceUrl;
  return undefined;
}
