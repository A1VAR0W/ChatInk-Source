import { buildApplication } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const application = await buildApplication(config);
let stopping = false;

async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  application.app.log.info({ signal }, 'controlled shutdown');
  try {
    await application.shutdown();
    process.exitCode = 0;
  } catch (error) {
    application.app.log.error({ err: error }, 'shutdown failed');
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void stop('SIGINT'));
process.once('SIGTERM', () => void stop('SIGTERM'));
process.once('uncaughtException', (error) => {
  application.app.log.fatal({ err: error }, 'uncaught exception');
  void stop('uncaughtException');
});
process.once('unhandledRejection', (error) => {
  application.app.log.fatal({ err: error }, 'unhandled rejection');
  void stop('unhandledRejection');
});

await application.app.listen({ host: config.host, port: config.port });
application.startCleanup();
application.app.log.info({ port: config.port }, 'Chat-Ink listening');
