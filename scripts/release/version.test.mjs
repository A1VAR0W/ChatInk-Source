import assert from 'node:assert/strict';
import test from 'node:test';

import {
  developmentVersion,
  legacyVersionCodeFromSegments,
  parseReleaseTag,
  preproductionVersionCodeFromSegments,
  versionCodeFromSegments,
} from './version.mjs';

test('calcula versionCode Android de forma monótona y determinista', () => {
  assert.equal(parseReleaseTag('v0.0.0').versionCode, 2);
  assert.equal(parseReleaseTag('v0.1.0').versionCode, 2_002);
  assert.equal(parseReleaseTag('v1.0.0').versionCode, 2_000_002);
  assert.equal(versionCodeFromSegments(1049, 999, 999), 2_100_000_000);
  assert.equal(legacyVersionCodeFromSegments(0, 1, 0), 1_001);
});

test('rechaza tags que no pertenecen al canal estable SemVer soportado', () => {
  for (const tag of ['1.2.3', 'v1.2', 'v01.2.3', 'v1.2.3-beta.1', 'v1.1000.0', 'v2100.0.0']) {
    assert.throws(() => parseReleaseTag(tag));
  }
});

test('preproducción y producción conservan el mismo nombre de release con códigos internos ordenados', () => {
  assert.deepEqual(developmentVersion('0.1.0', 42), {
    tag: 'v0.1.0',
    version: '0.1.0',
    versionCode: 2_001,
  });
  assert.equal(preproductionVersionCodeFromSegments(0, 1, 0), 2_001);
  assert.ok(preproductionVersionCodeFromSegments(0, 1, 0) < versionCodeFromSegments(0, 1, 0));
});
