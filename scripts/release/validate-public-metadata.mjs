import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APP,
  LEGACY_BUNDLE_IDENTIFIERS,
  PUBLIC_ICON_URL,
  PUBLIC_SOURCE_URL,
  apkAssetName,
  ipaAssetName,
  releaseAssetUrl,
  releaseUrl,
} from './release-config.mjs';
import { compareProductVersions, isKnownReleaseVersionCode, parseReleaseTag } from './version.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJson(text, filename) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${filename} no contiene JSON válido.`);
  }
}

function assertSha256(value, label) {
  assert(typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value), `${label} debe ser SHA-256 hexadecimal.`);
}

function assertHttpsUrl(value, label) {
  assert(typeof value === 'string', `${label} debe ser una URL.`);
  const url = new URL(value);
  assert(url.protocol === 'https:', `${label} debe usar HTTPS.`);
  assert(url.username === '' && url.password === '' && url.search === '', `${label} no puede contener credenciales ni query string.`);
}

function assertVersionEntry(entry, expectedVersion, label) {
  assert(entry && typeof entry === 'object', `${label} debe ser un objeto.`);
  assert(entry.version === expectedVersion, `${label}.version no coincide.`);
  assert(typeof entry.date === 'string' && !Number.isNaN(Date.parse(entry.date)), `${label}.date no es válida.`);
  assertHttpsUrl(entry.downloadURL, `${label}.downloadURL`);
  assert(Number.isSafeInteger(entry.size) && entry.size >= 0, `${label}.size no es válido.`);
}

export async function validatePublicMetadata(directory) {
  const root = resolve(directory);
  const [latestRaw, sourceRaw] = await Promise.all([
    readFile(resolve(root, 'latest.json'), 'utf8'),
    readFile(resolve(root, 'sidestore-source.json'), 'utf8'),
  ]);
  const latest = parseJson(latestRaw, 'latest.json');
  const source = parseJson(sourceRaw, 'sidestore-source.json');

  assert(latest && typeof latest === 'object', 'latest.json debe ser un objeto.');
  assert(latest.schemaVersion === 1 && latest.channel === 'stable', 'latest.json usa un esquema o canal no soportado.');
  assert(Object.hasOwn(latest, 'release'), 'latest.json debe declarar release.');
  assert(source && typeof source === 'object', 'sidestore-source.json debe ser un objeto.');
  assert(source.name === 'ChatInk Official Releases', 'El nombre de la fuente SideStore no coincide.');
  assert(source.identifier === 'com.a1var0w.chatink.releases', 'El identificador de la fuente SideStore no coincide.');
  assert(source.sourceURL === PUBLIC_SOURCE_URL, 'sourceURL no coincide con la URL pública estable.');
  assert(Array.isArray(source.apps), 'sidestore-source.json.apps debe ser un array.');

  if (latest.release === null) {
    assert(source.apps.length === 0, 'Una fuente sin release no puede anunciar aplicaciones.');
    return { state: 'empty' };
  }

  const release = latest.release;
  assert(release && typeof release === 'object' && !Array.isArray(release), 'latest.json.release debe ser un objeto o null.');
  const version = parseReleaseTag(release.tag);
  assert(release.version === version.version, 'latest.json.release.version no coincide con el tag.');
  assert(isKnownReleaseVersionCode(version, release.versionCode), 'latest.json.release.versionCode no corresponde con la versión SemVer.');
  assert(typeof release.publishedAt === 'string' && !Number.isNaN(Date.parse(release.publishedAt)), 'release.publishedAt no es válido.');
  assert(Array.isArray(release.notes) && release.notes.every((note) => typeof note === 'string'), 'release.notes debe ser un array de texto.');
  assert(release.minimumSupportedVersion === null || typeof release.minimumSupportedVersion === 'string', 'release.minimumSupportedVersion no es válido.');
  if (release.minimumSupportedVersion !== null) parseReleaseTag(`v${release.minimumSupportedVersion}`);
  assert(typeof release.mandatory === 'boolean', 'release.mandatory debe ser booleano.');
  assert(typeof release.releaseUrl === 'string', 'release.releaseUrl no es válido.');
  assert(release.platforms && typeof release.platforms === 'object', 'release.platforms no es válido.');

  const expectedApkUrl = releaseAssetUrl(version.version, apkAssetName(version.version));
  const expectedIpaUrl = releaseAssetUrl(version.version, ipaAssetName(version.version));
  assert(release.platforms.android?.downloadUrl === expectedApkUrl, 'La URL Android no apunta al asset permanente esperado.');
  assert(release.platforms.ios?.downloadUrl === expectedIpaUrl, 'La URL iOS no apunta al asset permanente esperado.');
  assert(release.releaseUrl === releaseUrl(version.version), 'releaseUrl no apunta a la release esperada.');
  assert(release.platforms.ios.sourceUrl === PUBLIC_SOURCE_URL, 'ios.sourceUrl no coincide con la fuente SideStore pública.');
  assertHttpsUrl(release.platforms.android.downloadUrl, 'platforms.android.downloadUrl');
  assertHttpsUrl(release.platforms.ios.downloadUrl, 'platforms.ios.downloadUrl');
  assertHttpsUrl(release.platforms.ios.sourceUrl, 'platforms.ios.sourceUrl');
  assertHttpsUrl(release.releaseUrl, 'releaseUrl');
  assertSha256(release.platforms.android.sha256, 'platforms.android.sha256');
  assertSha256(release.platforms.ios.sha256, 'platforms.ios.sha256');
  assert(Number.isSafeInteger(release.platforms.android.size) && release.platforms.android.size >= 0, 'platforms.android.size no es válido.');
  assert(Number.isSafeInteger(release.platforms.ios.size) && release.platforms.ios.size >= 0, 'platforms.ios.size no es válido.');

  const matchingApps = source.apps.filter((item) => item?.bundleIdentifier === APP.bundleIdentifier);
  assert(matchingApps.length === 1, 'La fuente SideStore debe contener exactamente una aplicación ChatInk.');
  assert(
    !source.apps.some((item) => LEGACY_BUNDLE_IDENTIFIERS.includes(item?.bundleIdentifier)),
    'La fuente SideStore no puede conservar identificadores de bundle heredados.',
  );
  const [app] = matchingApps;
  assert(app.name === APP.name && app.developerName === APP.developerName, 'Los metadatos de ChatInk no coinciden.');
  assert(app.localizedDescription === APP.description && app.iconURL === PUBLIC_ICON_URL, 'La descripción o el icono de ChatInk no coincide.');
  assert(app.downloadURL === expectedIpaUrl, 'El downloadURL compatible de SideStore no coincide.');
  assert(Array.isArray(app.versions) && app.versions.length > 0, 'Falta el historial de versiones de SideStore.');
  assertVersionEntry(app.versions[0], version.version, 'versions[0]');
  assert(app.versions[0].downloadURL === expectedIpaUrl, 'La versión SideStore no apunta al IPA correcto.');
  assert(app.version === version.version && app.versionDate === release.publishedAt, 'La versión superior de SideStore no coincide.');
  assert(app.size === release.platforms.ios.size, 'El tamaño del IPA de SideStore no coincide.');

  const versionNames = new Set();
  for (const [index, entry] of app.versions.entries()) {
    assert(typeof entry.version === 'string' && !versionNames.has(entry.version), `versions[${index}] está repetida o no tiene versión.`);
    parseReleaseTag(`v${entry.version}`);
    assertVersionEntry(entry, entry.version, `versions[${index}]`);
    versionNames.add(entry.version);
  }

  for (let index = 1; index < app.versions.length; index += 1) {
    assert(compareProductVersions(app.versions[index - 1].version, app.versions[index].version) > 0, 'El historial SideStore debe estar en orden descendente sin downgrades.');
  }

  return { state: 'published', version: version.version, versionCode: version.versionCode };
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const directory = optionValue('--directory');
  assert(directory, 'Indica --directory.');
  const result = await validatePublicMetadata(directory);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
