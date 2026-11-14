import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { defaultYamlLimits, readYaml, type YamlLimits } from "@halonicjs/yaml";
import { isInside } from "./repository-location.ts";

// The install runs outside the sandbox on files an earlier run may have
// committed. pnpm adds settings over time, so closing them one by one on the
// command line never ends; instead the checkout's own settings files may say
// only what is listed here, and the lockfile may name no local path outside
// the checkout. Anything else is refused before pnpm starts.

/**
 * The settings a checkout's `pnpm-workspace.yaml` may hold: what our own
 * repository uses, plus the common dependency settings. None of them names a
 * folder or a program on the host. `registries` is allowed because the
 * packages come from the lockfile's own addresses, and the host's registry
 * is pinned on the command line. `patchedDependencies` is checked for its
 * paths as well.
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
 * install write or read outside the checkout.
 *
 * @throws Error naming the file and what is refused
 */
export async function checkRunCheckoutFiles(folder: string): Promise<void> {
  await checkNpmrc(folder);
  await checkWorkspaceFile(folder);
  await checkLockfile(folder);
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

async function checkWorkspaceFile(folder: string): Promise<void> {
  const data = await readYamlFile(folder, "pnpm-workspace.yaml", defaultYamlLimits);
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
    if (typeof patch === "string") refuseOutside(folder, folder, patch, "pnpm-workspace.yaml");
  }
  refuseLocalPaths(folder, folder, data, "pnpm-workspace.yaml");
}

/**
 * pnpm 12 writes the lockfile as two YAML documents (the one for pnpm itself,
 * then the project's), and our YAML reader takes one, so each is read and
 * checked on its own.
 */
async function checkLockfile(folder: string): Promise<void> {
  const text = await readIfPresent(join(folder, "pnpm-lock.yaml"));
  if (text === undefined) return;
  for (const document of text.split(/^---[ \t]*$/m)) {
    checkLockfileDocument(folder, readYamlText(document, "pnpm-lock.yaml", lockfileLimits));
  }
}

function checkLockfileDocument(folder: string, data: unknown): void {
  if (!isRecord(data)) return;
  const importers = isRecord(data["importers"]) ? data["importers"] : {};
  for (const [project, entry] of Object.entries(importers)) {
    // A project's `link:` and `file:` paths start at the project's own folder.
    const projectFolder = refuseOutside(folder, folder, project, "pnpm-lock.yaml");
    refuseLocalPaths(folder, projectFolder, entry, "pnpm-lock.yaml");
  }
  const { importers: _checked, ...rest } = data;
  refuseLocalPaths(folder, folder, rest, "pnpm-lock.yaml");
}

/**
 * Walks a lockfile or settings value and refuses every local path that
 * leaves the checkout: `link:` and `file:` versions, `file:` tarballs, and
 * a `directory` resolution. The lockfile's integrity hashes don't cover
 * these entries, and pnpm copies what they name into the checkout.
 */
function refuseLocalPaths(checkout: string, base: string, value: unknown, file: string): void {
  if (typeof value === "string") {
    const local = /^(?:link|file):(.*)$/s.exec(value);
    if (local?.[1] !== undefined) refuseOutside(checkout, base, local[1], file);
  } else if (Array.isArray(value)) {
    for (const item of value) refuseLocalPaths(checkout, base, item, file);
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key === "directory" && typeof item === "string") {
        refuseOutside(checkout, checkout, item, file);
      } else {
        refuseLocalPaths(checkout, base, item, file);
      }
    }
  }
}

/** The absolute path of `path` from `base`; refused when it is absolute itself or leaves the checkout. */
function refuseOutside(checkout: string, base: string, path: string, file: string): string {
  const full = resolve(base, path);
  if (isAbsolute(path) || !isInside(checkout, full)) {
    throw new Error(`The checkout's ${file} names ${path}, which is outside the checkout.`);
  }
  return full;
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
