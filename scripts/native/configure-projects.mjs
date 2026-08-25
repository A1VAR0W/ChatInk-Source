import { access, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appForChannel } from '../release/release-config.mjs';
import { versionCodeFromSegments } from '../release/version.mjs';
import { configureAndroidMainActivity } from './android-main-activity.mjs';
import { configureAndroidManifest } from './android-manifest.mjs';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageJsonPath = join(rootDirectory, 'package.json');

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function replaceRequired(contents, expression, replacement, label) {
  if (!expression.test(contents)) throw new Error(`No se encontró ${label}. Regenera el proyecto nativo con Capacitor.`);
  return contents.replace(expression, replacement);
}

async function configureAndroidSecurity(androidDirectory) {
  const manifestPath = join(androidDirectory, 'app', 'src', 'main', 'AndroidManifest.xml');
  if (!(await pathExists(manifestPath))) return;

  const manifest = configureAndroidManifest(await readFile(manifestPath, 'utf8'));
  await writeFile(manifestPath, manifest, 'utf8');

  const xmlDirectory = join(androidDirectory, 'app', 'src', 'main', 'res', 'xml');
  await mkdir(xmlDirectory, { recursive: true });
  await writeFile(join(xmlDirectory, 'network_security_config.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n  <base-config cleartextTrafficPermitted="false" />\n</network-security-config>\n`, 'utf8');
  await writeFile(join(xmlDirectory, 'data_extraction_rules.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n  <cloud-backup disableIfNoEncryptionCapabilities="true">\n    <exclude domain="root" path="." />\n  </cloud-backup>\n  <device-transfer>\n    <exclude domain="root" path="." />\n  </device-transfer>\n</data-extraction-rules>\n`, 'utf8');
}

async function configureAndroidWindowAppearance(androidDirectory) {
  const resourcesDirectory = join(androidDirectory, 'app', 'src', 'main', 'res');
  const stylesPath = join(resourcesDirectory, 'values', 'styles.xml');
  if (!(await pathExists(stylesPath))) return;

  let styles = await readFile(stylesPath, 'utf8');
  styles = replaceRequired(
    styles,
    /<style name="AppTheme\.NoActionBar"[\s\S]*?<\/style>/,
    `<style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:windowBackground">@color/chatink_window_background</item>
        <item name="android:navigationBarColor">@color/chatink_window_background</item>
        <item name="android:statusBarColor">@color/chatink_window_background</item>
        <item name="android:windowLightNavigationBar">true</item>
        <item name="android:windowLightStatusBar">true</item>
    </style>`,
    'tema Android sin barra de acción',
  );
  await writeFile(stylesPath, styles, 'utf8');

  const nightValuesDirectory = join(resourcesDirectory, 'values-night');
  await mkdir(nightValuesDirectory, { recursive: true });
  await writeFile(join(resourcesDirectory, 'values', 'colors.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#6C5CE7</color>
    <color name="colorPrimaryDark">#5546CB</color>
    <color name="colorAccent">#6C5CE7</color>
    <color name="chatink_window_background">#F3F1FB</color>
</resources>
`, 'utf8');
  await writeFile(join(nightValuesDirectory, 'colors.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="chatink_window_background">#11101E</color>
</resources>
`, 'utf8');
  await writeFile(join(nightValuesDirectory, 'styles.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme.NoActionBar">
        <item name="android:windowLightNavigationBar">false</item>
        <item name="android:windowLightStatusBar">false</item>
    </style>
</resources>
`, 'utf8');
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) throw new Error(`La versión de package.json no es SemVer estable: ${version}`);
  return match.slice(1).map(Number);
}

function nativeBuildNumber(version) {
  const supplied = process.env.NATIVE_BUILD_NUMBER;
  if (supplied !== undefined) {
    if (!/^[1-9]\d*$/.test(supplied)) throw new Error('NATIVE_BUILD_NUMBER debe ser un entero positivo.');
    return Number(supplied);
  }

  const [major, minor, patch] = parseVersion(version);
  return versionCodeFromSegments(major, minor, patch);
}

async function findMainActivity(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = await findMainActivity(candidate);
      if (found !== undefined) return found;
    } else if (entry.isFile() && entry.name === 'MainActivity.java') {
      return candidate;
    }
  }
  return undefined;
}

async function configureAndroid(version, buildNumber, app) {
  const androidDirectory = join(rootDirectory, 'apps', 'client', 'android');
  const gradlePath = join(androidDirectory, 'app', 'build.gradle');
  if (!(await pathExists(gradlePath))) return false;

  let gradle = await readFile(gradlePath, 'utf8');
  gradle = replaceRequired(gradle, /namespace\s*=\s*"[^"]+"/, `namespace = "${app.bundleIdentifier}"`, 'namespace Android');
  gradle = replaceRequired(gradle, /applicationId\s+"[^"]+"/, `applicationId "${app.bundleIdentifier}"`, 'applicationId Android');
  gradle = replaceRequired(gradle, /versionCode\s+\d+/, `versionCode ${buildNumber}`, 'versionCode Android');
  gradle = replaceRequired(gradle, /versionName\s+"[^"]+"/, `versionName "${version}"`, 'versionName Android');
  await writeFile(gradlePath, gradle, 'utf8');
  await configureAndroidSecurity(androidDirectory);
  await configureAndroidWindowAppearance(androidDirectory);

  const stringsPath = join(androidDirectory, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
  if (await pathExists(stringsPath)) {
    let strings = await readFile(stringsPath, 'utf8');
    strings = replaceRequired(strings, /<string name="app_name">[^<]*<\/string>/, `<string name="app_name">${app.name}</string>`, 'app_name Android');
    strings = replaceRequired(strings, /<string name="title_activity_main">[^<]*<\/string>/, `<string name="title_activity_main">${app.name}</string>`, 'title_activity_main Android');
    strings = replaceRequired(strings, /<string name="package_name">[^<]*<\/string>/, `<string name="package_name">${app.bundleIdentifier}</string>`, 'package_name Android');
    strings = replaceRequired(strings, /<string name="custom_url_scheme">[^<]*<\/string>/, `<string name="custom_url_scheme">${app.bundleIdentifier}</string>`, 'custom_url_scheme Android');
    await writeFile(stringsPath, strings, 'utf8');
  }

  const javaRoot = join(androidDirectory, 'app', 'src', 'main', 'java');
  if (await pathExists(javaRoot)) {
    const mainActivity = await findMainActivity(javaRoot);
    if (mainActivity !== undefined) {
      const target = join(javaRoot, ...app.bundleIdentifier.split('.'), 'MainActivity.java');
      const source = configureAndroidMainActivity(await readFile(mainActivity, 'utf8'), app.bundleIdentifier);

      if (mainActivity === target) {
        await writeFile(mainActivity, source, 'utf8');
      } else if (await pathExists(target)) {
        throw new Error(`Ya existe ${relative(rootDirectory, target)}; no se sobrescribe código nativo existente.`);
      } else {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(mainActivity, source, 'utf8');
        await rename(mainActivity, target);
      }
    }
  }

  return true;
}

async function configureIos(version, buildNumber, app) {
  const iosDirectory = join(rootDirectory, 'apps', 'client', 'ios');
  const projectPath = join(iosDirectory, 'App', 'App.xcodeproj', 'project.pbxproj');
  if (!(await pathExists(projectPath))) return false;

  let project = await readFile(projectPath, 'utf8');
  project = replaceRequired(project, /CURRENT_PROJECT_VERSION\s*=\s*[^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`, 'CURRENT_PROJECT_VERSION iOS');
  project = replaceRequired(project, /MARKETING_VERSION\s*=\s*[^;]+;/g, `MARKETING_VERSION = ${version};`, 'MARKETING_VERSION iOS');
  project = replaceRequired(project, /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${app.bundleIdentifier};`, 'PRODUCT_BUNDLE_IDENTIFIER iOS');
  await writeFile(projectPath, project, 'utf8');

  const infoPlistPath = join(iosDirectory, 'App', 'App', 'Info.plist');
  if (await pathExists(infoPlistPath)) {
    let infoPlist = await readFile(infoPlistPath, 'utf8');
    infoPlist = replaceRequired(
      infoPlist,
      /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
      `$1${app.name}$2`,
      'CFBundleDisplayName iOS',
    );
    await writeFile(infoPlistPath, infoPlist, 'utf8');
  }

  return true;
}

async function main() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const version = packageJson.version;
  if (typeof version !== 'string') throw new Error('package.json debe contener una versión.');
  const buildNumber = nativeBuildNumber(version);

  const app = appForChannel(process.env.CHATINK_BUILD_CHANNEL ?? 'production');
  const configured = await Promise.all([configureAndroid(version, buildNumber, app), configureIos(version, buildNumber, app)]);
  const platforms = ['android', 'ios'].filter((_, index) => configured[index]);
  process.stdout.write(`${JSON.stringify({ appId: app.bundleIdentifier, appName: app.name, version, buildNumber, platforms })}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
