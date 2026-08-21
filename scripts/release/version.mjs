import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const VERSION_SEGMENT_LIMIT = 999;
const MAX_ANDROID_VERSION_CODE = 2_100_000_000;
const TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  throw new Error(message);
}

function parsePositiveInteger(value, label, maximum) {
  if (!/^[1-9]\d*$/.test(value)) fail(`${label} debe ser un entero positivo.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    fail(`${label} debe ser un entero entre 1 y ${maximum}.`);
  }
  return parsed;
}

export function versionCodeFromSegments(major, minor, patch) {
  if (![major, minor, patch].every(Number.isInteger)) {
    fail('Los segmentos de versión deben ser enteros.');
  }
  if (minor < 0 || minor > VERSION_SEGMENT_LIMIT || patch < 0 || patch > VERSION_SEGMENT_LIMIT) {
    fail(`Los segmentos MINOR y PATCH deben estar entre 0 y ${VERSION_SEGMENT_LIMIT}.`);
  }

  const code = major * 1_000_000 + minor * 1_000 + patch + 1;
  if (code < 1 || code > MAX_ANDROID_VERSION_CODE) {
    fail(`El versionCode calculado (${code}) excede el límite Android de ${MAX_ANDROID_VERSION_CODE}.`);
  }
  return code;
}

export function parseReleaseTag(tag) {
  const match = TAG_PATTERN.exec(tag);
  if (!match) {
    fail('El tag debe tener el formato exacto vMAJOR.MINOR.PATCH, sin prefijos ni sufijos.');
  }

  const [, majorText, minorText, patchText] = match;
  const major = Number(majorText);
  const minor = Number(minorText);
  const patch = Number(patchText);
  if (![major, minor, patch].every(Number.isSafeInteger)) fail('Los segmentos de versión no son seguros.');

  const versionCode = versionCodeFromSegments(major, minor, patch);
  return Object.freeze({
    tag,
    version: `${major}.${minor}.${patch}`,
    major,
    minor,
    patch,
    versionCode,
  });
}

export function developmentVersion(packageVersion, runNumber) {
  const stable = parseReleaseTag(`v${packageVersion}`);
  const versionCode = parsePositiveInteger(String(runNumber), 'GITHUB_RUN_NUMBER', MAX_ANDROID_VERSION_CODE);
  return Object.freeze({
    tag: `v${stable.version}-dev.${versionCode}`,
    version: `${stable.version}-dev.${versionCode}`,
    versionCode,
  });
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const tag = optionValue('--tag');
  const developmentPackageVersion = optionValue('--development-package-version');
  const developmentRun = optionValue('--development-run');
  const githubOutput = optionValue('--github-output');

  const result = tag
    ? parseReleaseTag(tag)
    : developmentPackageVersion && developmentRun
      ? developmentVersion(developmentPackageVersion, developmentRun)
      : fail('Indica --tag o --development-package-version junto con --development-run.');

  if (githubOutput) {
    const output = [
      `tag=${result.tag}`,
      `version=${result.version}`,
      `version_code=${result.versionCode}`,
    ].join('\n');
    await appendFile(githubOutput, `${output}\n`, 'utf8');
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
