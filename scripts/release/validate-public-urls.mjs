function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

export function validatePublicUrl(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} debe estar configurada.`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} no es una URL válida.`);
  }

  if (url.protocol !== 'https:' || !url.hostname) {
    throw new Error(`${label} debe usar HTTPS y un host público.`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} no puede incluir credenciales, query string ni fragmento.`);
  }
  return url.toString().replace(/\/$/, '');
}

function main() {
  const server = validatePublicUrl(optionValue('--server'), 'PUBLIC_SERVER_URL');
  const app = validatePublicUrl(optionValue('--app'), 'PUBLIC_APP_URL');
  process.stdout.write(`${JSON.stringify({ server, app })}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
import { fileURLToPath } from 'node:url';
