import { stableVersionPattern } from '@pictochat/shared';

export type ClientVersionPolicy = {
  minimumSupportedVersion: string;
  latestVersion: string;
  releaseUrl: string;
};

const UNKNOWN_VERSION = '0.0.0';

export function compareClientVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const match = stableVersionPattern.exec(value);
    if (match === null) return undefined;
    return match.slice(1).map(Number);
  };
  const leftParts = parse(left);
  const rightParts = parse(right);
  if (leftParts === undefined || rightParts === undefined) return -1;
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index]! > rightParts[index]! ? 1 : -1;
  }
  return 0;
}

export function readClientVersion(value: unknown): string {
  if (typeof value !== 'string' || value.length > 32 || !stableVersionPattern.test(value)) return UNKNOWN_VERSION;
  return value;
}

export function clientVersionSupported(version: unknown, policy: ClientVersionPolicy): boolean {
  return compareClientVersions(readClientVersion(version), policy.minimumSupportedVersion) >= 0;
}

export function unsupportedClientPayload(policy: ClientVersionPolicy) {
  return {
    error: 'Esta versión ya no es compatible y no puede seguir conectándose al servicio',
    code: 'CLIENT_VERSION_UNSUPPORTED',
    minimumSupportedVersion: policy.minimumSupportedVersion,
    latestVersion: policy.latestVersion,
    releaseUrl: policy.releaseUrl,
  };
}
