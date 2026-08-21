import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePublicUrl } from './validate-public-urls.mjs';

test('solo admite URLs HTTPS públicas sin material sensible', () => {
  assert.equal(validatePublicUrl('https://api.example.com/v1/', 'API'), 'https://api.example.com/v1');
  for (const value of ['http://api.example.com', 'https://token@example.com', 'https://example.com?token=x']) {
    assert.throws(() => validatePublicUrl(value, 'API'));
  }
});
