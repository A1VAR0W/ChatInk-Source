import assert from 'node:assert/strict';
import test from 'node:test';
import { configureAndroidManifest } from './android-manifest.mjs';

const manifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:allowBackup="true">
    <activity android:name=".MainActivity" android:exported="true" />
  </application>
</manifest>`;

test('configura adjustResize y la política de seguridad en el manifiesto generado', () => {
  const result = configureAndroidManifest(manifest);

  assert.match(result, /android:windowSoftInputMode="adjustResize"/);
  assert.match(result, /android:allowBackup="false"/);
  assert.match(result, /android:fullBackupContent="false"/);
  assert.match(result, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  assert.match(result, /android:usesCleartextTraffic="false"/);
  assert.match(result, /android:networkSecurityConfig="@xml\/network_security_config"/);
});

test('sustituye una política de teclado incompatible en lugar de duplicarla', () => {
  const result = configureAndroidManifest(manifest.replace('android:exported="true"', 'android:exported="true" android:windowSoftInputMode="adjustPan"'));

  assert.match(result, /android:windowSoftInputMode="adjustResize"/);
  assert.doesNotMatch(result, /adjustPan/);
  assert.equal(result.match(/android:windowSoftInputMode=/g)?.length, 1);
});

test('falla si el proyecto nativo no contiene MainActivity', () => {
  assert.throws(
    () => configureAndroidManifest(manifest.replace('android:name=".MainActivity"', 'android:name=".OtherActivity"')),
    /No se encontró MainActivity/,
  );
});
