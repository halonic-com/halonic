/**
 * The Studio app's version lives in `apps/studio/package.json`, the one
 * file Changesets writes. These helpers copy it into the Tauri config and
 * the Cargo workspace, and find the places where they disagree. Small text
 * edits, not a TOML library, so formatting and comments stay as they are.
 */

/** The files that carry the app version, relative to the repo root. */
export const appVersionFiles = {
  packageJson: "apps/studio/package.json",
  tauriConfig: "apps/studio/src-tauri/tauri.conf.json",
  cargoToml: "apps/studio/src-tauri/Cargo.toml",
  cargoLock: "apps/studio/src-tauri/Cargo.lock",
} as const;

/** A Cargo.toml of the Studio shell's Cargo workspace, the root one included. */
export const appCrateManifest = /^apps\/studio\/src-tauri\/(?:.+\/)?Cargo\.toml$/;

/** A version Changesets, Tauri and Cargo all accept: semver, no leading `v`. */
export const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** A version and the line it sits on, for messages. */
export interface FoundVersion {
  readonly version: string;
  readonly line: number;
}

/** The top-level `version` of a JSON file (package.json, tauri.conf.json). */
export function jsonVersion(text: string): string | undefined {
  const value = (JSON.parse(text) as { version?: unknown }).version;
  return typeof value === "string" ? value : undefined;
}

/** Sets the top-level `version` of a JSON file, written the way biome formats it. */
export function setJsonVersion(text: string, version: string): string {
  const value = JSON.parse(text) as Record<string, unknown>;
  return `${JSON.stringify({ ...value, version }, null, 2)}\n`;
}

const versionLine = /^version\s*=\s*"([^"]*)"/;

/** The lines of one TOML table, from its header to the next header. */
function tableLines(lines: readonly string[], header: string): [number, number] | undefined {
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) {
    return undefined;
  }
  const next = lines.findIndex((line, index) => index > start && /^\s*\[/.test(line));
  return [start, next === -1 ? lines.length : next];
}

/** The `version` in a Cargo.toml's `[workspace.package]` table. */
export function cargoWorkspaceVersion(text: string): FoundVersion | undefined {
  const lines = text.split("\n");
  const table = tableLines(lines, "[workspace.package]");
  if (table === undefined) {
    return undefined;
  }
  for (let index = table[0] + 1; index < table[1]; index++) {
    const match = versionLine.exec(lines[index] ?? "");
    if (match !== null) {
      return { version: match[1] ?? "", line: index + 1 };
    }
  }
  return undefined;
}

/** Sets (or adds) the `version` in a Cargo.toml's `[workspace.package]` table. */
export function setCargoWorkspaceVersion(text: string, version: string): string {
  const lines = text.split("\n");
  const table = tableLines(lines, "[workspace.package]");
  if (table === undefined) {
    throw new Error("Cargo.toml has no [workspace.package] table to hold the version.");
  }
  const found = cargoWorkspaceVersion(text);
  if (found === undefined) {
    lines.splice(table[0] + 1, 0, `version = "${version}"`);
  } else {
    lines[found.line - 1] = `version = "${version}"`;
  }
  return lines.join("\n");
}

/** True when a crate's `[package]` takes its version from the workspace. */
export function inheritsWorkspaceVersion(text: string): boolean {
  const lines = text.split("\n");
  const table = tableLines(lines, "[package]");
  if (table === undefined) {
    return true;
  }
  const own = lines.slice(table[0] + 1, table[1]);
  return own.some((line) =>
    /^version\s*(?:\.\s*workspace\s*=\s*true|=\s*\{\s*workspace\s*=\s*true\s*\})/.test(line),
  );
}

/** The crates of this Cargo workspace in a Cargo.lock: the entries with no `source`. */
export function localLockVersions(text: string): (FoundVersion & { name: string })[] {
  const found: (FoundVersion & { name: string })[] = [];
  forEachLocalEntry(text.split("\n"), (name, versionIndex, lines) => {
    const match = versionLine.exec(lines[versionIndex] ?? "");
    found.push({ name, version: match?.[1] ?? "", line: versionIndex + 1 });
  });
  return found;
}

/** Sets the version of every crate of this Cargo workspace in a Cargo.lock. */
export function setLocalLockVersions(text: string, version: string): string {
  const lines = text.split("\n");
  forEachLocalEntry(lines, (_name, versionIndex) => {
    lines[versionIndex] = `version = "${version}"`;
  });
  return lines.join("\n");
}

function forEachLocalEntry(
  lines: string[],
  visit: (name: string, versionIndex: number, lines: string[]) => void,
): void {
  for (let start = 0; start < lines.length; start++) {
    if (lines[start]?.trim() !== "[[package]]") {
      continue;
    }
    let end = start + 1;
    while (end < lines.length && !/^\s*\[/.test(lines[end] ?? "")) {
      end++;
    }
    const entry = lines.slice(start + 1, end);
    const name = /^name\s*=\s*"([^"]*)"/.exec(entry.find((line) => line.startsWith("name")) ?? "");
    const versionAt = entry.findIndex((line) => versionLine.test(line));
    if (name !== null && versionAt !== -1 && !entry.some((line) => line.startsWith("source"))) {
      visit(name[1] ?? "", start + 1 + versionAt, lines);
    }
  }
}
