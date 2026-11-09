import type { ReadFile } from "./app-version-sync.ts";
import { compareVersions } from "./semver.ts";

// A spec file is the committed JSON Schema of a public API, in the folder
// `spec/` of the package that owns it. When a release changes one, a frozen
// copy goes to `spec/released/<version>/`, so outsiders can read the API of
// every release (HAL-1664). Unchanged specs get no copy: the API version only
// goes up on a breaking change, and identical copies would bury the ones that
// matter.

const currentSpecFile = /^(?<folder>(?:.+\/)?spec)\/(?<name>[^/]+\.schema\.json)$/;
const releasedSpecFile =
  /^(?<folder>(?:.+\/)?spec)\/released\/(?<version>[^/]+)\/(?<name>[^/]+\.schema\.json)$/;

/** True for a current spec file, `<package>/spec/<name>.schema.json`. Released copies are not. */
export function isCurrentSpecFile(file: string): boolean {
  return currentSpecFile.test(file);
}

/** Where a spec file's frozen copy for `version` goes: `<package>/spec/released/<version>/<name>`. */
export function releasedSpecPath(specFile: string, version: string): string {
  const { folder, name } = currentSpecFile.exec(specFile)?.groups ?? {};
  if (folder === undefined || name === undefined) {
    throw new Error(`${specFile} is not a spec file (<package>/spec/<name>.schema.json).`);
  }
  return `${folder}/released/${version}/${name}`;
}

/** The versions that have a frozen copy of `specFile` among `files`, newest first. */
export function releasedVersions(specFile: string, files: readonly string[]): string[] {
  const versions: string[] = [];
  for (const file of files) {
    const groups = releasedSpecFile.exec(file)?.groups;
    if (groups?.["version"] === undefined) {
      continue;
    }
    if (releasedSpecPath(specFile, groups["version"]) === file) {
      versions.push(groups["version"]);
    }
  }
  return versions.sort((a, b) => compareVersions(b, a));
}

/**
 * The frozen copies to write for a release: each current spec file among
 * `files` whose text differs from its newest released copy, or that has
 * none yet, goes to `spec/released/<version>/`. `releaseVersion` names the
 * version for each spec file. Returns the new files and their text.
 *
 * @throws when a spec file was already released at that version with other
 *   text: a released file never changes, so the API needs a new release.
 */
export function snapshotChangedSpecs(
  files: readonly string[],
  read: ReadFile,
  releaseVersion: (specFile: string) => string,
): Map<string, string> {
  const snapshots = new Map<string, string>();
  for (const specFile of files.filter(isCurrentSpecFile)) {
    const text = read(specFile);
    if (text === undefined) {
      continue;
    }
    const newest = releasedVersions(specFile, files)[0];
    if (newest !== undefined && read(releasedSpecPath(specFile, newest)) === text) {
      continue;
    }
    const version = releaseVersion(specFile);
    const target = releasedSpecPath(specFile, version);
    if (newest === version) {
      throw new Error(
        `${specFile} differs from ${target}, which was already released. A released spec never changes; release the change under a new version.`,
      );
    }
    snapshots.set(target, text);
  }
  return snapshots;
}
