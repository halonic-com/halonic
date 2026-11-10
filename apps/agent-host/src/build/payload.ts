import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import type { PayloadManifest } from "../payload-manifest.ts";

/**
 * Collects the files the agent host runs from, for the build to embed in the
 * executable. The host can't be one bundled file: sandbox-runtime finds its
 * own programs (`apply-seccomp`, `srt-win.exe`) next to its code and is
 * started as a separate Node program, so it needs real files on disk.
 */

/** One file the build embeds. */
export interface PayloadFile {
  /** Relative to the payload's root, with `/` between folders. */
  path: string;
  /** Where it is on this machine, absolute. */
  source: string;
  /** Whether anyone may run it. Always false on Windows, where no file carries that mark. */
  executable: boolean;
}

/** Everything the host runs from. */
export interface Payload {
  /** Sorted by path. */
  files: PayloadFile[];
  /** Where each workspace package is in the payload, by its npm name. */
  packages: Record<string, string>;
}

/** The host's own build code, which the build runs and the host never loads. */
const buildFolder = "src/build";

/**
 * Collects the host's own `src`, without tests and without its build code;
 * every workspace package it depends on, at the same place as in the repo;
 * and every outside package those depend on, under `node_modules`. Only
 * `dependencies` and `optionalDependencies` count, never `devDependencies`.
 *
 * @param hostFolder - the agent host's package folder
 * @param repoRoot - the repo's root; a package found in it, outside any `node_modules`, is a workspace package
 * @throws when a dependency isn't installed, or two different copies of one outside package are needed
 */
export function collectPayload(hostFolder: string, repoRoot: string): Payload {
  const collector = new PayloadCollector(realpathSync(repoRoot));
  collector.add(realpathSync(hostFolder), [buildFolder]);
  return collector.payload();
}

/** What the executable does with the payload: see {@link PayloadManifest}. */
export type PayloadUse = Pick<PayloadManifest, "entry" | "programs">;

/**
 * The manifest of a payload: each file's digest and size, and one digest of
 * them all.
 *
 * @param read - reads a file's bytes; Node's own `readFileSync` unless a test gives another
 * @throws when the entry or a program isn't one of the payload's files
 */
export function payloadManifest(
  payload: Payload,
  use: PayloadUse,
  read: (source: string) => Uint8Array = readFileSync,
): PayloadManifest {
  const paths = new Set(payload.files.map((file) => file.path));
  for (const path of [use.entry, ...use.programs]) {
    if (!paths.has(path)) throw new Error(`The payload has no ${path}.`);
  }
  const files = payload.files.map(({ path, source, executable }) => {
    const bytes = read(source);
    return { path, sha256: sha256(bytes), size: bytes.byteLength, executable };
  });
  const listing = files.map(({ path, sha256 }) => `${path}\0${sha256}\n`).join("");
  return { digest: sha256(listing), ...use, packages: payload.packages, files };
}

function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** The parts of a `package.json` the collector reads. */
interface PackageJson {
  name: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/** Walks the dependencies from the host and gathers their files. */
class PayloadCollector {
  readonly #repoRoot: string;
  readonly #files = new Map<string, string>();
  readonly #packages: Record<string, string> = {};
  /** The folder of each outside package, by name, to catch two copies of one. */
  readonly #outside = new Map<string, string>();
  readonly #seen = new Set<string>();

  constructor(repoRoot: string) {
    this.#repoRoot = repoRoot;
  }

  /**
   * Adds the package in `folder`, then each package it depends on.
   *
   * @param skipped - folders of a workspace package, relative to it, to leave out
   */
  add(folder: string, skipped: readonly string[] = []): void {
    if (this.#seen.has(folder)) return;
    this.#seen.add(folder);
    const manifest = JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as PackageJson;
    if (this.#isWorkspace(folder)) {
      this.#addWorkspacePackage(folder, manifest.name, skipped);
    } else {
      this.#addOutsidePackage(folder, manifest.name);
    }
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      this.add(installedFolder(name, folder, manifest.name));
    }
    for (const name of Object.keys(manifest.optionalDependencies ?? {})) {
      const found = findInstalled(name, folder);
      if (found !== undefined) this.add(found);
    }
  }

  payload(): Payload {
    // The default sort compares code units, so the order is the same on every machine.
    const paths = [...this.#files.keys()].sort();
    const files = paths.map((path) => {
      const source = this.#files.get(path) ?? "";
      return { path, source, executable: (statSync(source).mode & 0o111) !== 0 };
    });
    return { files, packages: this.#packages };
  }

  #isWorkspace(folder: string): boolean {
    const inRepo = relative(this.#repoRoot, folder);
    return !inRepo.startsWith("..") && !inRepo.split(sep).includes("node_modules");
  }

  /** Its `package.json` and the runtime files of its `src`, at the same place as in the repo. */
  #addWorkspacePackage(folder: string, name: string, skipped: readonly string[]): void {
    const at = toPayloadPath(relative(this.#repoRoot, folder));
    this.#packages[name] = at;
    this.#addFile(`${at}/package.json`, join(folder, "package.json"));
    for (const file of filesIn(join(folder, "src"))) {
      const inPackage = `src/${file}`;
      if (skipped.some((skip) => inPackage.startsWith(`${skip}/`))) continue;
      if (isTestFile(file)) continue;
      this.#addFile(`${at}/${inPackage}`, join(folder, "src", file));
    }
  }

  /** All its files but source maps and type declarations, under `node_modules`. */
  #addOutsidePackage(folder: string, name: string): void {
    const earlier = this.#outside.get(name);
    if (earlier !== undefined && earlier !== folder) {
      throw new Error(
        `The agent host needs two copies of ${name}, in ${earlier} and ${folder}. Make pnpm install one.`,
      );
    }
    this.#outside.set(name, folder);
    for (const file of filesIn(folder)) {
      if (/\.map$|\.d\.[cm]?ts$/.test(file)) continue;
      this.#addFile(`node_modules/${name}/${file}`, join(folder, file));
    }
  }

  #addFile(path: string, source: string): void {
    this.#files.set(path, source);
  }
}

/** Test files and test helpers, which the host never loads. */
function isTestFile(file: string): boolean {
  return /\.test(-helper)?\.[cm]?tsx?$|\.test-d\.ts$/.test(file);
}

/**
 * Every regular file under `folder`, relative to it with `/` between folders.
 * Skips nested `node_modules` (a dependency is collected on its own) and
 * symbolic links. An absent folder has none.
 */
function filesIn(folder: string): string[] {
  if (!existsSync(folder)) return [];
  const files: string[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(join(folder, at), { withFileTypes: true })) {
      const path = at === "" ? entry.name : `${at}/${entry.name}`;
      if (entry.isDirectory() && entry.name !== "node_modules") walk(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  walk("");
  return files;
}

/** @throws when `name` isn't installed where `from` can load it */
function installedFolder(name: string, from: string, fromName: string): string {
  const found = findInstalled(name, from);
  if (found === undefined) {
    throw new Error(`${name}, which ${fromName} depends on, isn't installed. Run pnpm install.`);
  }
  return found;
}

/**
 * The real folder of package `name` as Node finds it from `from`: in the
 * `node_modules` of `from` and of each folder above it, never inside a
 * `node_modules` folder itself.
 */
function findInstalled(name: string, from: string): string | undefined {
  for (let folder = from; ; folder = dirname(folder)) {
    if (basename(folder) !== "node_modules") {
      const candidate = join(folder, "node_modules", name);
      if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    }
    if (dirname(folder) === folder) return undefined;
  }
}

function toPayloadPath(path: string): string {
  return path.split(sep).join("/");
}
