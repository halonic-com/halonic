import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { defaultYamlLimits, readYaml, type YamlLimits } from "@halonicjs/yaml";
import { isInside } from "./repository-location.ts";
import { refuseOtherRegistries, refuseRemoteSources } from "./run-checkout-sources.ts";

// The install runs outside the sandbox on files an earlier run may have
// committed. pnpm adds settings over time, so closing them one by one on the
// command line never ends; instead the checkout's own settings files may say
// only what is listed here, and the lockfile may name no local path outside
// the checkout and no package source but the pinned registry. Anything else is
// refused before pnpm starts.

/**
 * The settings a checkout's `pnpm-workspace.yaml` may hold: what our own
 * repository uses, plus the common dependency settings. None of them names a
 * folder or a program on the host. `registries` is allowed when it names
 * only the pinned registry. `patchedDependencies` is checked for its paths
 * as well.
 */
const allowedWorkspaceSettings = new Set([
  "packages",
  "catalog",
  "catalogs",
  "overrides",
  "patchedDependencies",
  "onlyBuiltDependencies",
  "allowBuilds",
  "minimumReleaseAge",
  "minimumReleaseAgeExclude",
  "blockExoticSubdeps",
  "trustPolicy",
  "enableGlobalVirtualStore",
  "linkWorkspacePackages",
  "saveWorkspaceProtocol",
  "registries",
  "lockfileIncludeTarballUrl",
]);

/** The settings a checkout's `.npmrc` may hold. None: our repository has no `.npmrc`, and every setting moved to `pnpm-workspace.yaml`. */
const allowedNpmrcSettings = new Set<string>();

/** A lockfile of a large repository is a few megabytes; the default limit is for workspace files. */
const lockfileLimits: YamlLimits = { maxDepth: 100, maxLength: 64 * 1024 * 1024 };

/**
 * Refuses a checkout whose settings files or lockfile would make the
 * install write or read outside the checkout, or fetch from anywhere but the
 * pinned registry.
 *
 * @param registry the registry the install is pinned to
 * @throws Error naming the file and what is refused
 */
export async function checkRunCheckoutFiles(folder: string, registry: string): Promise<void> {
  const paths = new CheckoutPaths(folder);
  await checkNpmrc(folder);
  await checkWorkspaceFile(paths, registry);
  await checkLockfile(paths, registry);
  await paths.refuseThroughLinks();
}

async function checkNpmrc(folder: string): Promise<void> {
  const text = await readIfPresent(join(folder, ".npmrc"));
  if (text === undefined) return;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    const setting = trimmed.split("=")[0]?.trim() ?? trimmed;
    if (!allowedNpmrcSettings.has(setting)) {
      throw new Error(`The checkout's .npmrc sets ${setting}, which Halonic doesn't install with.`);
    }
  }
}

async function checkWorkspaceFile(paths: CheckoutPaths, registry: string): Promise<void> {
  const data = await readYamlFile(paths.checkout, "pnpm-workspace.yaml", defaultYamlLimits);
  if (!isRecord(data)) return;
  for (const setting of Object.keys(data)) {
    if (!allowedWorkspaceSettings.has(setting)) {
      throw new Error(
        `The checkout's pnpm-workspace.yaml sets ${setting}, which Halonic doesn't install with.`,
      );
    }
  }
  for (const pattern of stringList(data["packages"])) {
    const glob = pattern.replace(/^!/, "");
    if (isAbsolute(glob) || glob.split(/[\\/]/).includes("..")) {
      throw new Error(
        `The checkout's pnpm-workspace.yaml lists the package folder ${pattern}, outside the checkout.`,
      );
    }
  }
  for (const patch of Object.values(
    isRecord(data["patchedDependencies"]) ? data["patchedDependencies"] : {},
  )) {
    if (typeof patch === "string") paths.add(paths.checkout, patch, "pnpm-workspace.yaml");
  }
  collectLocalPaths(paths, paths.checkout, data, "pnpm-workspace.yaml");
  refuseOtherRegistries(data["registries"], registry);
}

/**
 * pnpm 12 writes the lockfile as two YAML documents (the one for pnpm itself,
 * then the project's), and our YAML reader takes one, so each is read and
 * checked on its own.
 */
async function checkLockfile(paths: CheckoutPaths, registry: string): Promise<void> {
  const text = await readIfPresent(join(paths.checkout, "pnpm-lock.yaml"));
  if (text === undefined) return;
  for (const document of text.split(/^---[ \t]*$/m)) {
    const data = readYamlText(document, "pnpm-lock.yaml", lockfileLimits);
    if (!isRecord(data)) continue;
    checkLockfileDocument(paths, data);
    refuseRemoteSources(data, registry);
  }
}

function checkLockfileDocument(paths: CheckoutPaths, data: Record<string, unknown>): void {
  const importers = isRecord(data["importers"]) ? data["importers"] : {};
  for (const [project, entry] of Object.entries(importers)) {
    // A project's `link:` and `file:` paths start at the project's own folder.
    const projectFolder = paths.add(paths.checkout, project, "pnpm-lock.yaml");
    collectLocalPaths(paths, projectFolder, entry, "pnpm-lock.yaml");
  }
  const { importers: _checked, ...rest } = data;
  collectLocalPaths(paths, paths.checkout, rest, "pnpm-lock.yaml");
}

/**
 * Walks a lockfile or settings value and records every local path in it:
 * `link:` and `file:` versions, `file:` tarballs, and a `directory`
 * resolution. The lockfile's integrity hashes don't cover these entries, and
 * pnpm copies what they name into the checkout.
 */
function collectLocalPaths(paths: CheckoutPaths, base: string, value: unknown, file: string): void {
  if (typeof value === "string") {
    const local = /^(?:link|file):(.*)$/s.exec(value);
    if (local?.[1] !== undefined) paths.add(base, local[1], file);
  } else if (Array.isArray(value)) {
    for (const item of value) collectLocalPaths(paths, base, item, file);
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key === "directory" && typeof item === "string") {
        paths.add(paths.checkout, item, file);
      } else {
        collectLocalPaths(paths, base, item, file);
      }
    }
  }
}

/**
 * The local paths a checkout's files name. {@link CheckoutPaths.add} refuses
 * one that is absolute or leaves the checkout by its text; the check of what
 * they really are waits until all are known, in {@link CheckoutPaths.refuseThroughLinks}.
 */
class CheckoutPaths {
  private readonly named: { path: string; full: string; file: string }[] = [];

  readonly checkout: string;

  constructor(checkout: string) {
    this.checkout = checkout;
  }

  /** Records `path` from `base`, and returns its absolute path; refused when it is absolute itself or leaves the checkout. */
  add(base: string, path: string, file: string): string {
    const full = resolve(base, path);
    if (isAbsolute(path) || !isInside(this.checkout, full)) throw outsideCheckout(file, path);
    this.named.push({ path, full, file });
    return full;
  }

  /**
   * Refuses a path that leaves the checkout through a link, such as a
   * committed link to a folder of the host, which the text of the path
   * doesn't show, and a path that doesn't exist, which can't be checked.
   */
  async refuseThroughLinks(): Promise<void> {
    const checkout = await realpath(this.checkout);
    for (const { path, full, file } of this.named) {
      const real = await realpathOrRefuse(full, path, file);
      if (!isInside(checkout, real)) throw outsideCheckout(file, path);
    }
  }
}

async function realpathOrRefuse(full: string, path: string, file: string): Promise<string> {
  try {
    return await realpath(full);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`The checkout's ${file} names ${path}, which doesn't exist in the checkout.`);
    }
    throw error;
  }
}

function outsideCheckout(file: string, path: string): Error {
  return new Error(`The checkout's ${file} names ${path}, which is outside the checkout.`);
}

async function readYamlFile(folder: string, name: string, limits: YamlLimits): Promise<unknown> {
  const text = await readIfPresent(join(folder, name));
  return text === undefined ? undefined : readYamlText(text, name, limits);
}

function readYamlText(text: string, name: string, limits: YamlLimits): unknown {
  const read = readYaml(text, limits);
  if (!read.ok) {
    const { message, line, col } = read.error;
    throw new Error(
      `The checkout's ${name} can't be read (line ${line}, column ${col}): ${message}`,
    );
  }
  return read.value.data;
}

/** The text of a file, or `undefined` when there is no such file. */
async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
