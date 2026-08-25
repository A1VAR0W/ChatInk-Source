import { describe, expect, it } from 'vitest';
import { clientVersionSupported, compareClientVersions, unsupportedClientPayload } from './client-version.js';
import { buildApplication } from '../app.js';
import { tempTestRoot, testConfig } from '../test-utils.js';
import { rm } from 'node:fs/promises';

const policy = {
  minimumSupportedVersion: '1.10.0',
  latestVersion: '1.10.0',
  releaseUrl: 'https://example.test/releases/v1.10.0',
};

describe('client compatibility policy', () => {
  it('compares SemVer numerically and rejects malformed/missing versions', () => {
    expect(compareClientVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(clientVersionSupported('1.9.9', policy)).toBe(false);
    expect(clientVersionSupported(undefined, policy)).toBe(false);
    expect(clientVersionSupported('1.10.0', policy)).toBe(true);
  });

  it('returns a structured upgrade response', () => {
    expect(unsupportedClientPayload(policy)).toMatchObject({ code: 'CLIENT_VERSION_UNSUPPORTED', minimumSupportedVersion: '1.10.0' });
  });

  it('enforces REST compatibility with HTTP 426 while exposing the public policy', async () => {
    const root = await tempTestRoot();
    const application = await buildApplication(testConfig(root, {
      minSupportedClientVersion: '1.10.0', latestClientVersion: '1.10.0', clientReleaseUrl: policy.releaseUrl,
    }));
    try {
      const blocked = await application.app.inject({ method: 'POST', url: '/api/sessions', payload: { alias: 'Ada' } });
      expect(blocked.statusCode).toBe(426);
      expect(blocked.json()).toMatchObject({ code: 'CLIENT_VERSION_UNSUPPORTED', minimumSupportedVersion: '1.10.0' });
      const allowed = await application.app.inject({ method: 'POST', url: '/api/sessions', headers: { 'x-chatink-client-version': '1.10.0' }, payload: { alias: 'Ada' } });
      expect(allowed.statusCode).toBe(200);
      const endpoint = await application.app.inject({ method: 'GET', url: '/api/client-policy' });
      expect(endpoint.statusCode).toBe(200);
    } finally {
      await application.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  });
});
