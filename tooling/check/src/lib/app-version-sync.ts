import {
  appVersionFiles,
  cargoWorkspaceVersion,
  inheritsWorkspaceVersion,
  jsonVersion,
  localLockVersions,
  semverPattern,
  setCargoWorkspaceVersion,
  setJsonVersion,
  setLocalLockVersions,
} from "./app-version.ts";

/** Reads a repo file, or returns undefined when it doesn't exist (yet). */
export type ReadFile = (file: string) => string | undefined;

/** A place where the app version is missing or differs from package.json. */
export interface VersionProblem {
  readonly file: string;
  readonly message: string;
  readonly line?: number;
}

const fix = "Run `pnpm version:sync` to copy the version from apps/studio/package.json.";

/** The app version from apps/studio/package.json, checked to be semver. */
export function appVersion(read: ReadFile): string {
  const text = read(appVersionFiles.packageJson);
  const version = text === undefined ? undefined : jsonVersion(text);
  if (version === undefined || !semverPattern.test(version)) {
    throw new Error(
      `${appVersionFiles.packageJson} needs a "version" like "0.1.0"; it has ${JSON.stringify(version)}.`,
    );
  }
  return version;
}

/**
 * Copies the app version into tauri.conf.json, Cargo.toml and the
 * workspace crates in Cargo.lock. Files that don't exist yet are left out.
 * Returns only the files whose text changed.
 */
export function syncAppVersion(read: ReadFile): Map<string, string> {
  const version = appVersion(read);
  const edits: [string, (text: string, version: string) => string][] = [
    [appVersionFiles.tauriConfig, setJsonVersion],
    [appVersionFiles.cargoToml, setCargoWorkspaceVersion],
    [appVersionFiles.cargoLock, setLocalLockVersions],
  ];
  const changed = new Map<string, string>();
  for (const [file, edit] of edits) {
    const text = read(file);
    if (text === undefined) {
      continue;
    }
    const updated = edit(text, version);
    if (updated !== text) {
      changed.set(file, updated);
    }
  }
  return changed;
}

/**
 * Every place that disagrees with the app version. Nothing to compare (no
 * Tauri config, no Cargo.toml) means no problems.
 */
export function appVersionProblems(
  read: ReadFile,
  crateManifests: readonly string[],
): VersionProblem[] {
  const tauri = read(appVersionFiles.tauriConfig);
  const cargo = read(appVersionFiles.cargoToml);
  if (tauri === undefined && cargo === undefined) {
    return [];
  }
  let version: string;
  try {
    version = appVersion(read);
  } catch (error) {
    return [{ file: appVersionFiles.packageJson, message: (error as Error).message }];
  }
  const problems: VersionProblem[] = [];
  const differs = (file: string, found: string | undefined, line?: number): void => {
    if (found !== version) {
      const has = found === undefined ? "no version" : `version ${found}`;
      const message = `has ${has}, but the app is ${version}. ${fix}`;
      problems.push(line === undefined ? { file, message } : { file, line, message });
    }
  };
  if (tauri !== undefined) {
    differs(appVersionFiles.tauriConfig, jsonVersion(tauri));
  }
  if (cargo !== undefined) {
    const found = cargoWorkspaceVersion(cargo);
    differs(appVersionFiles.cargoToml, found?.version, found?.line);
  }
  const lock = read(appVersionFiles.cargoLock);
  for (const entry of lock === undefined ? [] : localLockVersions(lock)) {
    differs(appVersionFiles.cargoLock, entry.version, entry.line);
  }
  for (const manifest of crateManifests) {
    const text = read(manifest);
    if (text !== undefined && !inheritsWorkspaceVersion(text)) {
      problems.push({
        file: manifest,
        message:
          "sets its own version. Use `version.workspace = true`, so every crate carries the app version.",
      });
    }
  }
  return problems;
}
