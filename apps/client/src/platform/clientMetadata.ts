import { Capacitor } from '@capacitor/core';

const version = import.meta.env.VITE_APP_VERSION || '0.1.0';
const build = import.meta.env.VITE_APP_VERSION_CODE || '1';
const platform = Capacitor.getPlatform();
const channel = import.meta.env.VITE_UPDATE_MANIFEST_URL?.includes('preproduction-update.json') ? 'preproduction' : 'stable';

export const clientMetadata = Object.freeze({
  version,
  build,
  platform: platform === 'android' || platform === 'ios' ? platform : 'web',
  channel,
});

export const clientVersionHeaders = Object.freeze({
  'X-ChatInk-Client-Version': clientMetadata.version,
  'X-ChatInk-Client-Build': clientMetadata.build,
  'X-ChatInk-Client-Platform': clientMetadata.platform,
  'X-ChatInk-Client-Channel': clientMetadata.channel,
});

export const CLIENT_VERSION_UNSUPPORTED_EVENT = 'chatink:client-version-unsupported';

export function reportUnsupportedClient(): void {
  window.dispatchEvent(new Event(CLIENT_VERSION_UNSUPPORTED_EVENT));
}
