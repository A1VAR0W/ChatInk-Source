import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
import { compareProductVersions, legacyVersionCodeFromSegments, parseReleaseTag } from './version.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireString(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} es obligatorio.`);
  return value;
}

function requireNonNegativeInteger(value, label) {
  const parsed = Number(value);
  assert(Number.isSafeInteger(parsed) && parsed >= 0, `${label} debe ser un entero no negativo.`);
  return parsed;
}

function requireSha256(value, label) {
  assert(/^[a-f0-9]{64}$/i.test(value), `${label} debe ser un SHA-256 hexadecimal.`);
  return value.toLowerCase();
}

function parseJson(text, filename) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${filename} no contiene JSON válido.`);
  }
}

function isChatInkApp(entry) {
  return entry?.bundleIdentifier === APP.bundleIdentifier
    || LEGACY_BUNDLE_IDENTIFIERS.includes(entry?.bundleIdentifier);
}

function publicReadme(version) {
  return `# ChatInk Releases

Este repositorio público contiene exclusivamente binarios oficiales y metadatos de actualización de **ChatInk**. El código fuente, la infraestructura y la configuración privada no se distribuyen aquí.

## Versión actual

${version ? `La versión estable actual es [v${version}](${releaseUrl(version)}).` : 'Todavía no hay una versión pública publicada.'}

## Descargas

${
  version
    ? `- [Android APK](${releaseAssetUrl(version, apkAssetName(version))})
- [iOS IPA para SideStore/AltStore](${releaseAssetUrl(version, ipaAssetName(version))})
- [SHA256SUMS](${releaseAssetUrl(version, 'SHA256SUMS')})`
    : 'Las descargas aparecerán con la primera versión publicada.'
}

## Verificación

Descarga \`SHA256SUMS\` de la misma release y comprueba los hashes antes de instalar. En PowerShell:

\`\`\`powershell
Get-FileHash .\\ChatInk-X.Y.Z.apk -Algorithm SHA256
Get-FileHash .\\ChatInk-X.Y.Z.ipa -Algorithm SHA256
\`\`\`

## Instalación Android

Descarga únicamente el APK de la release oficial y comprueba su SHA-256 antes de instalarlo. Android puede solicitar autorización para instalar desde esa fuente; ChatInk no instala binarios de forma silenciosa.

## iOS SideStore / AltStore

La fuente compatible con SideStore y AltStore está disponible en:

\`\`\`text
${PUBLIC_SOURCE_URL}
\`\`\`

Los binarios de iOS se redistribuyen para que SideStore o AltStore los firmen con la cuenta Apple del usuario. No es una distribución de App Store ni una instalación directa desde Safari.\n`;
}

async function readExistingSource(path) {
  const source = parseJson(await readFile(path, 'utf8'), 'sidestore-source.json');
  assert(source && typeof source === 'object' && Array.isArray(source.apps), 'sidestore-source.json debe contener apps.');
  return source;
}

async function readExistingLatest(path) {
  const latest = parseJson(await readFile(path, 'utf8'), 'latest.json');
  assert(latest && typeof latest === 'object', 'latest.json debe ser un objeto.');
  assert(latest.schemaVersion === 1 && latest.channel === 'stable', 'latest.json usa un esquema o canal no soportado.');
  if (Object.hasOwn(latest, 'release')) {
    assert(latest.release === null || (typeof latest.release === 'object' && !Array.isArray(latest.release)), 'latest.json.release no es válido.');
    return latest;
  }

  const version = parseReleaseTag(`v${requireString(latest.version, 'latest.json.version')}`);
  assert(latest.versionCode === legacyVersionCodeFromSegments(version.major, version.minor, version.patch), 'latest.json.versionCode no corresponde con la versión heredada.');
  return {
    schemaVersion: 1,
    channel: 'stable',
    release: {
      tag: version.tag,
      version: version.version,
    },
    legacy: true,
  };
}

export async function generatePublicMetadata(options) {
  const version = parseReleaseTag(requireString(options.tag, 'tag'));
  const mode = options.mode ?? 'publish';
  assert(mode === 'publish' || mode === 'repair', 'mode debe ser publish o repair.');

  const outputDirectory = resolve(requireString(options.outputDirectory, 'outputDirectory'));
  const sourcePath = resolve(outputDirectory, 'sidestore-source.json');
  const latestPath = resolve(outputDirectory, 'latest.json');
  const [existingSource, existingLatest] = await Promise.all([readExistingSource(sourcePath), readExistingLatest(latestPath)]);
  const existingRelease = existingLatest.release;
  assert(mode === 'publish' || !existingLatest.legacy, 'repair no admite el manifiesto público heredado.');
  if (existingRelease !== null) {
    const existingVersion = parseReleaseTag(requireString(existingRelease.tag, 'latest.json.release.tag'));
    assert(existingRelease.version === existingVersion.version, 'latest.json.release.version no coincide con su tag.');
    const comparison = compareProductVersions(version.version, existingVersion.version);
    if (mode === 'publish') assert(comparison > 0, `La versión ${version.version} no es mayor que la última publicada (${existingVersion.version}).`);
    else assert(comparison === 0, 'repair solo puede reconstruir la misma versión publicada.');
  } else {
    assert(mode === 'publish', 'repair requiere una release existente.');
  }

  const rawPublishedAt = mode === 'repair'
    ? requireString(existingRelease?.publishedAt, 'latest.json.release.publishedAt')
    : requireString(options.publishedAt, 'publishedAt');
  const publishedDate = new Date(rawPublishedAt);
  assert(!Number.isNaN(publishedDate.getTime()), 'publishedAt debe ser una fecha ISO-8601 válida.');
  const publishedAt = publishedDate.toISOString();
  const apkSha256 = requireSha256(options.apkSha256, 'apkSha256');
  const ipaSha256 = requireSha256(options.ipaSha256, 'ipaSha256');
  const apkSize = requireNonNegativeInteger(options.apkSize, 'apkSize');
  const ipaSize = requireNonNegativeInteger(options.ipaSize, 'ipaSize');

  const apkName = apkAssetName(version.version);
  const ipaName = ipaAssetName(version.version);
  const apkUrl = releaseAssetUrl(version.version, apkName);
  const ipaUrl = releaseAssetUrl(version.version, ipaName);
  const notes = mode === 'repair'
    ? existingRelease.notes
    : [`Publicación oficial de ChatInk v${version.version}.`];
  assert(Array.isArray(notes) && notes.every((note) => typeof note === 'string' && note.length > 0), 'Las notas de release no son válidas.');
  const minimumSupportedVersion = mode === 'repair' ? existingRelease.minimumSupportedVersion : null;
  const mandatory = mode === 'repair' ? existingRelease.mandatory : false;
  const newSideStoreVersion = {
    version: version.version,
    date: publishedAt,
    downloadURL: ipaUrl,
    localizedDescription: notes.join('\n'),
    size: ipaSize,
  };

  const existingApp = existingSource.apps.find((app) => app?.bundleIdentifier === APP.bundleIdentifier);
  const existingVersions = existingApp?.versions ?? [];
  assert(Array.isArray(existingVersions), 'El historial de versiones de SideStore debe ser un array.');
  const duplicateVersion = existingVersions.some((entry) => entry?.version === version.version);
  if (mode === 'publish') assert(!duplicateVersion, `La versión ${version.version} ya existe en sidestore-source.json.`);

  const app = {
    name: APP.name,
    bundleIdentifier: APP.bundleIdentifier,
    developerName: APP.developerName,
    subtitle: APP.subtitle,
    localizedDescription: APP.description,
    iconURL: PUBLIC_ICON_URL,
    tintColor: APP.tintColor,
    version: version.version,
    versionDate: publishedAt,
    versionDescription: notes.join('\n'),
    downloadURL: ipaUrl,
    size: ipaSize,
    versions: [newSideStoreVersion, ...existingVersions.filter((entry) => entry?.version !== version.version)],
  };

  const source = {
    name: 'ChatInk Official Releases',
    identifier: 'com.a1var0w.chatink.releases',
    sourceURL: PUBLIC_SOURCE_URL,
    apps: [app, ...existingSource.apps.filter((item) => !isChatInkApp(item))],
  };

  const release = {
    tag: version.tag,
    version: version.version,
    versionCode: version.versionCode,
    publishedAt,
    minimumSupportedVersion,
    mandatory,
    notes,
    releaseUrl: releaseUrl(version.version),
    platforms: {
      android: {
        downloadUrl: apkUrl,
        sha256: apkSha256,
        size: apkSize,
      },
      ios: {
        downloadUrl: ipaUrl,
        sha256: ipaSha256,
        size: ipaSize,
        sourceUrl: PUBLIC_SOURCE_URL,
      },
    },
  };

  const latest = {
    schemaVersion: 1,
    channel: 'stable',
    release,
  };

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDirectory, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`, 'utf8'),
    writeFile(resolve(outputDirectory, 'sidestore-source.json'), `${JSON.stringify(source, null, 2)}\n`, 'utf8'),
    writeFile(resolve(outputDirectory, 'README.md'), publicReadme(version.version), 'utf8'),
  ]);

  return { latest, source };
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const outputDirectory = optionValue('--output-directory');
  const tag = optionValue('--tag');
  const publishedAt = optionValue('--published-at');
  const apkSha256 = optionValue('--apk-sha256');
  const ipaSha256 = optionValue('--ipa-sha256');
  const apkSize = optionValue('--apk-size');
  const ipaSize = optionValue('--ipa-size');
  const mode = optionValue('--mode');

  const result = await generatePublicMetadata({
    outputDirectory,
    tag,
    publishedAt,
    apkSha256,
    ipaSha256,
    apkSize,
    ipaSize,
    ...(mode === undefined ? {} : { mode }),
  });
  process.stdout.write(`${JSON.stringify({ version: result.latest.release?.version, versionCode: result.latest.release?.versionCode })}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
