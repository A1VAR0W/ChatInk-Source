import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig environment isolation', () => {
  it('uses safe development defaults', () => {
    const config = loadConfig({});

    expect(config.nodeEnv).toBe('development');
    expect(config.trustProxy).toBe(false);
    expect(config.serveClient).toBe(false);
  });

  it.each([
    'development-only-secret-change-me-now',
    'local-docker-secret-change-before-production-123',
    'replace-with-at-least-32-random-characters',
    'replace-with-a-random-secret-of-at-least-32-characters',
  ])('rejects the known insecure secret %s in production', (tokenSecret) => {
    expect(() => loadConfig({ NODE_ENV: 'production', TOKEN_SECRET: tokenSecret })).toThrow(
      'TOKEN_SECRET debe configurarse de forma segura en produccion',
    );
  });

  it('accepts an explicit production secret', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      TOKEN_SECRET: 'correct-horse-battery-staple-production-only',
    });

    expect(config.nodeEnv).toBe('production');
    expect(config.tokenSecret).toBe('correct-horse-battery-staple-production-only');
  });
});
