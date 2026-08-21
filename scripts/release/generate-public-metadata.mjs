import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

## iOS sideload

La fuente compatible con SideStore y AltStore está disponible en:

\`\`\`text
${PUBLIC_SOURCE_URL}
\`\`\`

Los binarios de iOS se redistribuyen para que SideStore o AltStore los firmen con la cuenta Apple del usuario.\n`;
}

async function readExistingSource(path) {
  const source = parseJson(await readFile(path, 'utf8'), 'sidestore-source.json');
  assert(source && typeof source === 'object' && Array.isArray(source.apps), 'sidestore-source.json debe contener apps.');
  return source;
}

export async function generatePublicMetadata(options) {
  const version = parseReleaseTag(requireString(options.tag, 'tag'));
  const rawPublishedAt = requireString(options.publishedAt, 'publishedAt');
  const publishedDate = new Date(rawPublishedAt);
  assert(!Number.isNaN(publishedDate.getTime()), 'publishedAt debe ser una fecha ISO-8601 válida.');
  const publishedAt = publishedDate.toISOString();

  const outputDirectory = resolve(requireString(options.outputDirectory, 'outputDirectory'));
  const sourcePath = resolve(outputDirectory, 'sidestore-source.json');
  const existingSource = await readExistingSource(sourcePath);
  const apkSha256 = requireSha256(options.apkSha256, 'apkSha256');
  const ipaSha256 = requireSha256(options.ipaSha256, 'ipaSha256');
  const apkSize = requireNonNegativeInteger(options.apkSize, 'apkSize');
  const ipaSize = requireNonNegativeInteger(options.ipaSize, 'ipaSize');

  const apkName = apkAssetName(version.version);
  const ipaName = ipaAssetName(version.version);
  const apkUrl = releaseAssetUrl(version.version, apkName);
  const ipaUrl = releaseAssetUrl(version.version, ipaName);
  const notes = [`Publicación oficial de ChatInk v${version.version}.`];
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
  assert(
    !existingVersions.some((entry) => entry?.version === version.version),
    `La versión ${version.version} ya existe en sidestore-source.json.`,
  );

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
    versions: [newSideStoreVersion, ...existingVersions],
  };

  const source = {
    name: 'ChatInk Official Releases',
    identifier: 'com.a1var0w.chatink.releases',
    sourceURL: PUBLIC_SOURCE_URL,
    apps: [app, ...existingSource.apps.filter((item) => item?.bundleIdentifier !== APP.bundleIdentifier)],
  };

  const latest = {
    schemaVersion: 1,
    channel: 'stable',
    version: version.version,
    versionCode: version.versionCode,
    publishedAt,
    minimumSupportedVersion: null,
    mandatory: false,
    notes,
    android: {
      downloadUrl: apkUrl,
      sha256: apkSha256,
      size: apkSize,
    },
    ios: {
      downloadUrl: ipaUrl,
      sha256: ipaSha256,
      size: ipaSize,
    },
    releaseUrl: releaseUrl(version.version),
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

  const result = await generatePublicMetadata({
    outputDirectory,
    tag,
    publishedAt,
    apkSha256,
    ipaSha256,
    apkSize,
    ipaSize,
  });
  process.stdout.write(`${JSON.stringify({ version: result.latest.version, versionCode: result.latest.versionCode })}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
