import assert from 'node:assert/strict';
import test from 'node:test';

import { developmentVersion, parseReleaseTag, versionCodeFromSegments } from './version.mjs';

test('calcula versionCode Android de forma monótona y determinista', () => {
  assert.equal(parseReleaseTag('v0.0.0').versionCode, 1);
  assert.equal(parseReleaseTag('v0.1.0').versionCode, 1_001);
  assert.equal(parseReleaseTag('v1.0.0').versionCode, 1_000_001);
  assert.equal(versionCodeFromSegments(2099, 999, 999), 2_100_000_000);
});

test('rechaza tags que no pertenecen al canal estable SemVer soportado', () => {
  for (const tag of ['1.2.3', 'v1.2', 'v01.2.3', 'v1.2.3-beta.1', 'v1.1000.0', 'v2100.0.0']) {
    assert.throws(() => parseReleaseTag(tag));
  }
});

test('las builds de desarrollo no se confunden con una release oficial', () => {
  assert.deepEqual(developmentVersion('0.1.0', 42), {
    tag: 'v0.1.0-dev.42',
    version: '0.1.0-dev.42',
    versionCode: 42,
  });
});
