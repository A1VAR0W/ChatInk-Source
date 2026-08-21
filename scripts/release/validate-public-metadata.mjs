import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APP,
  PUBLIC_ICON_URL,
  PUBLIC_SOURCE_URL,
  apkAssetName,
  ipaAssetName,
  releaseAssetUrl,
  releaseUrl,
} from './release-config.mjs';
import { parseReleaseTag } from './version.mjs';

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
  assert(source && typeof source === 'object', 'sidestore-source.json debe ser un objeto.');
  assert(source.name === 'ChatInk Official Releases', 'El nombre de la fuente SideStore no coincide.');
  assert(source.identifier === 'com.a1var0w.chatink.releases', 'El identificador de la fuente SideStore no coincide.');
  assert(source.sourceURL === PUBLIC_SOURCE_URL, 'sourceURL no coincide con la URL pública estable.');
  assert(Array.isArray(source.apps), 'sidestore-source.json.apps debe ser un array.');

  if (latest.release === null) {
    assert(source.apps.length === 0, 'Una fuente sin release no puede anunciar aplicaciones.');
    return { state: 'empty' };
  }

  const version = parseReleaseTag(`v${latest.version}`);
  assert(latest.versionCode === version.versionCode, 'latest.json.versionCode no corresponde con la versión SemVer.');
  assert(typeof latest.publishedAt === 'string' && !Number.isNaN(Date.parse(latest.publishedAt)), 'publishedAt no es válido.');
  assert(Array.isArray(latest.notes), 'latest.json.notes debe ser un array.');
  assert(latest.minimumSupportedVersion === null || typeof latest.minimumSupportedVersion === 'string', 'minimumSupportedVersion no es válido.');
  assert(typeof latest.mandatory === 'boolean', 'mandatory debe ser booleano.');

  const expectedApkUrl = releaseAssetUrl(version.version, apkAssetName(version.version));
  const expectedIpaUrl = releaseAssetUrl(version.version, ipaAssetName(version.version));
  assert(latest.android?.downloadUrl === expectedApkUrl, 'La URL Android no apunta al asset permanente esperado.');
  assert(latest.ios?.downloadUrl === expectedIpaUrl, 'La URL iOS no apunta al asset permanente esperado.');
  assert(latest.releaseUrl === releaseUrl(version.version), 'releaseUrl no apunta a la release esperada.');
  assertHttpsUrl(latest.android.downloadUrl, 'android.downloadUrl');
  assertHttpsUrl(latest.ios.downloadUrl, 'ios.downloadUrl');
  assertHttpsUrl(latest.releaseUrl, 'releaseUrl');
  assertSha256(latest.android.sha256, 'android.sha256');
  assertSha256(latest.ios.sha256, 'ios.sha256');
  assert(Number.isSafeInteger(latest.android.size) && latest.android.size >= 0, 'android.size no es válido.');
  assert(Number.isSafeInteger(latest.ios.size) && latest.ios.size >= 0, 'ios.size no es válido.');

  const app = source.apps.find((item) => item?.bundleIdentifier === APP.bundleIdentifier);
  assert(app, 'La fuente SideStore no contiene ChatInk.');
  assert(app.name === APP.name && app.developerName === APP.developerName, 'Los metadatos de ChatInk no coinciden.');
  assert(app.localizedDescription === APP.description && app.iconURL === PUBLIC_ICON_URL, 'La descripción o el icono de ChatInk no coincide.');
  assert(app.downloadURL === expectedIpaUrl, 'El downloadURL compatible de SideStore no coincide.');
  assert(Array.isArray(app.versions) && app.versions.length > 0, 'Falta el historial de versiones de SideStore.');
  assertVersionEntry(app.versions[0], version.version, 'versions[0]');
  assert(app.versions[0].downloadURL === expectedIpaUrl, 'La versión SideStore no apunta al IPA correcto.');
  assert(app.version === version.version && app.versionDate === latest.publishedAt, 'La versión superior de SideStore no coincide.');
  assert(app.size === latest.ios.size, 'El tamaño del IPA de SideStore no coincide.');

  const versionNames = new Set();
  for (const [index, entry] of app.versions.entries()) {
    assert(typeof entry.version === 'string' && !versionNames.has(entry.version), `versions[${index}] está repetida o no tiene versión.`);
    versionNames.add(entry.version);
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
