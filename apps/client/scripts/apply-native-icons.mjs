import { access, cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(clientRoot, 'assets', 'native');
const requestedPlatform = process.argv[2] ?? 'all';

if (!['all', 'android', 'ios'].includes(requestedPlatform)) {
  throw new Error(`Plataforma no valida: ${requestedPlatform}`);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function applyAndroid(required) {
  const target = resolve(clientRoot, 'android', 'app', 'src', 'main', 'res');
  if (!(await exists(target))) {
    if (required) throw new Error('Primero genera la plataforma Android con cap:add:android.');
    return false;
  }

  await cp(resolve(sourceRoot, 'android', 'res'), target, { recursive: true, force: true });
  console.log('Iconos de Chat-Ink aplicados a Android.');
  return true;
}

async function applyIos(required) {
  const target = resolve(
    clientRoot,
    'ios',
    'App',
    'App',
    'Assets.xcassets',
    'AppIcon.appiconset',
    'AppIcon-512@2x.png',
  );
  const targetDirectory = dirname(target);
  if (!(await exists(resolve(clientRoot, 'ios', 'App')))) {
    if (required) throw new Error('Primero genera la plataforma iOS con cap:add:ios.');
    return false;
  }

  await mkdir(targetDirectory, { recursive: true });
  await cp(resolve(sourceRoot, 'ios', 'AppIcon-512@2x.png'), target, { force: true });
  console.log('Icono de Chat-Ink aplicado a iOS.');
  return true;
}

if (requestedPlatform === 'android') await applyAndroid(true);
else if (requestedPlatform === 'ios') await applyIos(true);
else {
  const applied = await Promise.all([applyAndroid(false), applyIos(false)]);
  if (!applied.some(Boolean)) console.log('No hay plataformas nativas generadas; no se copiaron iconos.');
}
