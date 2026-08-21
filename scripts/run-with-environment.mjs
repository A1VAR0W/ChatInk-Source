import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename } from 'node:path';

const [environmentFile, executable, ...args] = process.argv.slice(2);

if (!environmentFile || !executable) {
  throw new Error('Uso: run-with-environment.mjs <archivo-env> <npm|script-node> [...args]');
}

const mode = basename(environmentFile).match(/^\.env\.(development|production)$/)?.[1];
if (!mode) {
  throw new Error('El archivo debe ser .env.development o .env.production');
}

const isolatedKeys = new Set([
  'NODE_ENV',
  'HOST',
  'PORT',
  'TOKEN_SECRET',
  'ALLOWED_ORIGINS',
  'TRUST_PROXY',
  'SERVE_CLIENT',
  'CLIENT_DIST',
  'TEMP_ROOT',
  'SESSION_TTL_MS',
  'ROOM_TOKEN_TTL_MS',
  'ROOM_MAX_AGE_MS',
  'ROOM_EMPTY_TTL_MS',
  'CLEANUP_INTERVAL_MS',
  'ORPHAN_MAX_AGE_MS',
  'ROOM_MAX_PARTICIPANTS',
  'ROOMS_PER_SESSION',
  'MAX_MESSAGES_PER_ROOM',
  'MAX_MESSAGE_CHARS',
  'MAX_FILE_BYTES',
  'MAX_FILES_PER_ROOM',
  'API_RATE_LIMIT_PER_MINUTE',
  'CREATE_ROOM_RATE_LIMIT_PER_HOUR',
  'MESSAGE_RATE_LIMIT_PER_MINUTE',
  'UPLOAD_RATE_LIMIT_PER_MINUTE',
  'CONNECTION_RATE_LIMIT_PER_MINUTE',
  'VITE_SERVER_URL',
  'VITE_PUBLIC_APP_URL',
  'VITE_MAX_FILE_BYTES',
]);
const childEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !isolatedKeys.has(key.toUpperCase())),
);
childEnvironment.NODE_ENV = mode;

const nodeArguments = [];
if (existsSync(environmentFile)) {
  nodeArguments.push(`--env-file=${environmentFile}`);
}

if (executable === 'npm') {
  if (!process.env.npm_execpath) {
    throw new Error('No se pudo localizar npm_execpath');
  }
  nodeArguments.push(process.env.npm_execpath, ...args);
} else {
  nodeArguments.push(executable, ...args);
}

const child = spawn(process.execPath, nodeArguments, {
  env: childEnvironment,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}

child.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
