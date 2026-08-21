export const APP = Object.freeze({
  name: 'ChatInk',
  bundleIdentifier: 'io.github.a1var0w.chatink',
  developerName: 'A1VAR0W',
  subtitle: 'Chat efímero de texto, dibujo y archivos.',
  description:
    'Cliente oficial de ChatInk para salas temporales con texto, dibujos y archivos.',
  tintColor: '#6c5ce7',
});

export const PUBLIC_RELEASE_REPOSITORY = 'A1VAR0W/ChatInk-Releases';
export const PUBLIC_RELEASE_BASE_URL = `https://github.com/${PUBLIC_RELEASE_REPOSITORY}`;
export const PUBLIC_SOURCE_URL =
  'https://raw.githubusercontent.com/A1VAR0W/ChatInk-Releases/main/sidestore-source.json';
export const PUBLIC_ICON_URL =
  'https://raw.githubusercontent.com/A1VAR0W/ChatInk-Releases/main/icon-512.png';

export function apkAssetName(version) {
  return `ChatInk-${version}.apk`;
}

export function ipaAssetName(version) {
  return `ChatInk-${version}.ipa`;
}

export function releaseTag(version) {
  return `v${version}`;
}

export function releaseUrl(version) {
  return `${PUBLIC_RELEASE_BASE_URL}/releases/tag/${releaseTag(version)}`;
}

export function releaseAssetUrl(version, assetName) {
  return `${PUBLIC_RELEASE_BASE_URL}/releases/download/${releaseTag(version)}/${assetName}`;
}
