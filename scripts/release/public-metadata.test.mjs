import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { generatePublicMetadata } from './generate-public-metadata.mjs';
import { validatePublicMetadata } from './validate-public-metadata.mjs';

const EMPTY_SOURCE = {
  name: 'ChatInk Official Releases',
  identifier: 'com.a1var0w.chatink.releases',
  sourceURL: 'https://raw.githubusercontent.com/A1VAR0W/ChatInk-Releases/main/sidestore-source.json',
  apps: [],
};

test('genera latest.json y una fuente SideStore con historial en orden inverso', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chatink-release-metadata-'));
  await writeFile(join(directory, 'sidestore-source.json'), `${JSON.stringify(EMPTY_SOURCE)}\n`);
  await writeFile(join(directory, 'latest.json'), '{"schemaVersion":1,"channel":"stable","release":null}\n');

  const common = {
    outputDirectory: directory,
    publishedAt: '2026-08-21T12:00:00.000Z',
    apkSha256: 'a'.repeat(64),
    ipaSha256: 'b'.repeat(64),
    apkSize: 10,
    ipaSize: 20,
  };
  await generatePublicMetadata({ ...common, tag: 'v0.1.0' });
  await generatePublicMetadata({ ...common, tag: 'v0.2.0', publishedAt: '2026-08-22T12:00:00.000Z' });

  assert.deepEqual(await validatePublicMetadata(directory), {
    state: 'published',
    version: '0.2.0',
    versionCode: 2_001,
  });
  const source = JSON.parse(await readFile(join(directory, 'sidestore-source.json'), 'utf8'));
  assert.deepEqual(source.apps[0].versions.map((entry) => entry.version), ['0.2.0', '0.1.0']);
});

test('repair conserva la fecha y rechaza republicaciones o downgrades', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chatink-release-repair-'));
  await writeFile(join(directory, 'sidestore-source.json'), `${JSON.stringify(EMPTY_SOURCE)}\n`);
  await writeFile(join(directory, 'latest.json'), '{"schemaVersion":1,"channel":"stable","release":null}\n');
  const common = {
    outputDirectory: directory,
    publishedAt: '2026-08-21T12:00:00.000Z',
    apkSha256: 'a'.repeat(64),
    ipaSha256: 'b'.repeat(64),
    apkSize: 10,
    ipaSize: 20,
  };
  await generatePublicMetadata({ ...common, tag: 'v0.2.0' });
  const before = JSON.parse(await readFile(join(directory, 'latest.json'), 'utf8'));
  await generatePublicMetadata({
    ...common,
    tag: 'v0.2.0',
    publishedAt: '2030-01-01T00:00:00.000Z',
    apkSha256: 'c'.repeat(64),
    ipaSha256: 'd'.repeat(64),
    mode: 'repair',
  });
  const after = JSON.parse(await readFile(join(directory, 'latest.json'), 'utf8'));
  assert.equal(after.release.publishedAt, before.release.publishedAt);
  assert.deepEqual(after.release.notes, before.release.notes);
  await assert.rejects(generatePublicMetadata({ ...common, tag: 'v0.2.0' }));
  await assert.rejects(generatePublicMetadata({ ...common, tag: 'v0.1.0' }));
});

test('migra el manifiesto público heredado al primer formato de release', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chatink-release-legacy-'));
  await writeFile(join(directory, 'sidestore-source.json'), `${JSON.stringify(EMPTY_SOURCE)}\n`);
  await writeFile(join(directory, 'latest.json'), '{"schemaVersion":1,"channel":"stable","version":"0.1.0","versionCode":1001}\n');

  await generatePublicMetadata({
    outputDirectory: directory,
    tag: 'v0.1.1',
    publishedAt: '2026-08-22T12:00:00.000Z',
    apkSha256: 'a'.repeat(64),
    ipaSha256: 'b'.repeat(64),
    apkSize: 10,
    ipaSize: 20,
  });

  assert.deepEqual(await validatePublicMetadata(directory), {
    state: 'published',
    version: '0.1.1',
    versionCode: 1002,
  });
});
