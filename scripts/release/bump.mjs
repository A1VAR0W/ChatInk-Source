import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProductVersion, readCanonicalProductVersion } from './version.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const allowedKinds = new Set(['patch', 'minor', 'major']);

function nextVersion(version, kind) {
  if (kind === 'patch') return `${version.major}.${version.minor}.${version.patch + 1}`;
  if (kind === 'minor') return `${version.major}.${version.minor + 1}.0`;
  return `${version.major + 1}.0.0`;
}

async function updateVersion(path, version) {
  const packageJson = JSON.parse(await readFile(path, 'utf8'));
  packageJson.version = version;
  await writeFile(path, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

async function main() {
  const kind = process.argv[2];
  if (kind === undefined || !allowedKinds.has(kind)) {
    throw new Error('Usa exactamente: npm run release:bump -- patch|minor|major');
  }

  const current = await readCanonicalProductVersion();
  const version = nextVersion(current, kind);
  parseProductVersion(version);
  await Promise.all([
    updateVersion(resolve(repositoryRoot, 'package.json'), version),
    updateVersion(resolve(repositoryRoot, 'apps', 'client', 'package.json'), version),
  ]);

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npmResult = spawnSync(npmCommand, ['install', '--package-lock-only', '--ignore-scripts'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (npmResult.status !== 0) throw new Error('No se pudo actualizar package-lock.json.');
  process.stdout.write(`Versión preparada: ${version}. No se ha creado ningún tag ni se ha hecho push.\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'No se pudo actualizar la versión.');
  process.exitCode = 1;
});
