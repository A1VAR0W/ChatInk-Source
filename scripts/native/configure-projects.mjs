import { access, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP } from '../release/release-config.mjs';
import { versionCodeFromSegments } from '../release/version.mjs';

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

async function configureAndroid(version, buildNumber) {
  const androidDirectory = join(rootDirectory, 'apps', 'client', 'android');
  const gradlePath = join(androidDirectory, 'app', 'build.gradle');
  if (!(await pathExists(gradlePath))) return false;

  let gradle = await readFile(gradlePath, 'utf8');
  gradle = replaceRequired(gradle, /namespace\s*=\s*"[^"]+"/, `namespace = "${APP.bundleIdentifier}"`, 'namespace Android');
  gradle = replaceRequired(gradle, /applicationId\s+"[^"]+"/, `applicationId "${APP.bundleIdentifier}"`, 'applicationId Android');
  gradle = replaceRequired(gradle, /versionCode\s+\d+/, `versionCode ${buildNumber}`, 'versionCode Android');
  gradle = replaceRequired(gradle, /versionName\s+"[^"]+"/, `versionName "${version}"`, 'versionName Android');
  await writeFile(gradlePath, gradle, 'utf8');

  const stringsPath = join(androidDirectory, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
  if (await pathExists(stringsPath)) {
    let strings = await readFile(stringsPath, 'utf8');
    strings = replaceRequired(strings, /<string name="app_name">[^<]*<\/string>/, `<string name="app_name">${APP.name}</string>`, 'app_name Android');
    strings = replaceRequired(strings, /<string name="title_activity_main">[^<]*<\/string>/, `<string name="title_activity_main">${APP.name}</string>`, 'title_activity_main Android');
    strings = replaceRequired(strings, /<string name="package_name">[^<]*<\/string>/, `<string name="package_name">${APP.bundleIdentifier}</string>`, 'package_name Android');
    strings = replaceRequired(strings, /<string name="custom_url_scheme">[^<]*<\/string>/, `<string name="custom_url_scheme">${APP.bundleIdentifier}</string>`, 'custom_url_scheme Android');
    await writeFile(stringsPath, strings, 'utf8');
  }

  const javaRoot = join(androidDirectory, 'app', 'src', 'main', 'java');
  if (await pathExists(javaRoot)) {
    const mainActivity = await findMainActivity(javaRoot);
    if (mainActivity !== undefined) {
      const target = join(javaRoot, ...APP.bundleIdentifier.split('.'), 'MainActivity.java');
      let source = await readFile(mainActivity, 'utf8');
      source = replaceRequired(source, /^package\s+[^;]+;/m, `package ${APP.bundleIdentifier};`, 'package de MainActivity');

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

async function configureIos(version, buildNumber) {
  const iosDirectory = join(rootDirectory, 'apps', 'client', 'ios');
  const projectPath = join(iosDirectory, 'App', 'App.xcodeproj', 'project.pbxproj');
  if (!(await pathExists(projectPath))) return false;

  let project = await readFile(projectPath, 'utf8');
  project = replaceRequired(project, /CURRENT_PROJECT_VERSION\s*=\s*[^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`, 'CURRENT_PROJECT_VERSION iOS');
  project = replaceRequired(project, /MARKETING_VERSION\s*=\s*[^;]+;/g, `MARKETING_VERSION = ${version};`, 'MARKETING_VERSION iOS');
  project = replaceRequired(project, /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${APP.bundleIdentifier};`, 'PRODUCT_BUNDLE_IDENTIFIER iOS');
  await writeFile(projectPath, project, 'utf8');

  const infoPlistPath = join(iosDirectory, 'App', 'App', 'Info.plist');
  if (await pathExists(infoPlistPath)) {
    let infoPlist = await readFile(infoPlistPath, 'utf8');
    infoPlist = replaceRequired(
      infoPlist,
      /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
      `$1${APP.name}$2`,
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

  const configured = await Promise.all([configureAndroid(version, buildNumber), configureIos(version, buildNumber)]);
  const platforms = ['android', 'ios'].filter((_, index) => configured[index]);
  process.stdout.write(`${JSON.stringify({ appId: APP.bundleIdentifier, appName: APP.name, version, buildNumber, platforms })}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
