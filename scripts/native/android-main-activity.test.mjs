import assert from 'node:assert/strict';
import test from 'node:test';
import { configureAndroidMainActivity } from './android-main-activity.mjs';

const generatedSource = `package com.example.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}`;

test('genera una política de insets distinta para Android antiguo y edge-to-edge', () => {
  const result = configureAndroidMainActivity(generatedSource, 'com.gmail.alvaroaguileracuesta.preproduction');

  assert.match(result, /^package com\.gmail\.alvaroaguileracuesta\.preproduction;/);
  assert.match(result, /Build\.VERSION\.SDK_INT < Build\.VERSION_CODES\.VANILLA_ICE_CREAM/);
  assert.match(result, /\? "disable"\s*: "css"/);
  assert.match(result, /getPluginConfiguration\("SystemBars"\)/);
  assert.match(result, /super\.onCreate\(savedInstanceState\)/);
});

test('rechaza actividades nativas desconocidas', () => {
  assert.throws(
    () => configureAndroidMainActivity(generatedSource.replace('extends BridgeActivity', 'extends Activity'), 'com.example.app'),
    /no extiende BridgeActivity/,
  );
});
