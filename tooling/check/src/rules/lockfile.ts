import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";

const lockfile = "pnpm-lock.yaml";

/** One entry of the lockfile's `packages:` section, with the lines we look at. */
export interface LockedPackage {
  readonly key: string;
  readonly line: number;
  readonly resolution: string | undefined;
}

/**
 * Reads the `packages:` section of a pnpm v9 lockfile. The format is
 * regular (two-space keys, four-space fields), so a line reader keeps
 * this check free of a YAML library.
 */
export function readLockedPackages(text: string): LockedPackage[] {
  const lines = text.split("\n");
  const entries: LockedPackage[] = [];
  let inPackages = false;
  let current: { key: string; line: number; resolution: string | undefined } | undefined;
  let collectingBlock = false;
  lines.forEach((line, index) => {
    if (/^\S/.test(line)) {
      inPackages = line.startsWith("packages:");
      return;
    }
    if (!inPackages) {
      return;
    }
    const key = /^ {2}(['"]?)([^ ].*)\1:\s*$/.exec(line);
    if (key?.[2] !== undefined) {
      current = { key: key[2], line: index + 1, resolution: undefined };
      collectingBlock = false;
      entries.push(current);
      return;
    }
    if (current === undefined) {
      return;
    }
    const resolution = /^ {4}resolution:\s*(.*)$/.exec(line);
    if (resolution?.[1] !== undefined) {
      current.resolution = resolution[1].trim();
      collectingBlock = current.resolution === "";
      return;
    }
    // A multi-line resolution (the Node runtime) continues at deeper indentation.
    if (collectingBlock && /^ {6,}\S/.test(line)) {
      current.resolution = `${current.resolution ?? ""}\n${line.trim()}`;
      return;
    }
    collectingBlock = false;
  });
  return entries;
}

/** Explains what is wrong with one locked package, or returns `undefined` if it is fine. */
export function lockedPackageProblem(entry: LockedPackage): string | undefined {
  const { resolution, key } = entry;
  if (resolution === undefined) {
    return `${key} has no resolution.`;
  }
  const runtime = /^node@runtime:(\d+\.\d+\.\d+)$/.exec(key);
  if (runtime?.[1] !== undefined) {
    return nodeRuntimeProblem(key, runtime[1], resolution);
  }
  if (/\btarball:/.test(resolution)) {
    return `${key} comes from a tarball URL, not from the npm registry.`;
  }
  if (/\btype:\s*(?:git|directory)\b/.test(resolution) || /\brepo:/.test(resolution)) {
    return `${key} comes from git or a local folder, not from the npm registry.`;
  }
  if (!/\bintegrity:\s*sha512-/.test(resolution)) {
    return `${key} has no sha512 integrity hash.`;
  }
  if (/@(?:file|link|git\+|https?):/.test(key) || /\((?:file|git)/.test(key)) {
    return `${key} is not a registry package.`;
  }
  return undefined;
}

/**
 * The Node version pinned by `devEngines.runtime` is locked as one binary
 * per platform. Each must come from the Node.js project's release folder
 * for that exact version (musl and RISC-V builds live on its
 * unofficial-builds host) and carry a hash.
 */
function nodeRuntimeProblem(key: string, version: string, resolution: string): string | undefined {
  const urls = [...resolution.matchAll(/^url:\s*(\S+)$/gm)].map((match) => match[1] ?? "");
  const hashes = [...resolution.matchAll(/^integrity:\s*sha(?:256|512)-\S+$/gm)];
  if (urls.length === 0 || hashes.length !== urls.length) {
    return `${key} needs a hash for every platform binary.`;
  }
  const allowedPrefixes = ["nodejs.org", "unofficial-builds.nodejs.org"].map(
    (host) => `https://${host}/download/release/v${version}/`,
  );
  if (urls.some((url) => !allowedPrefixes.some((prefix) => url.startsWith(prefix)))) {
    return `${key} downloads from somewhere other than ${allowedPrefixes.join(" or ")}.`;
  }
  return undefined;
}

/**
 * Fails on any lockfile entry without an integrity hash, from a registry
 * other than npm, or from git, a tarball URL or `file:` (plan 3.2, 10.2).
 * pnpm writes a `tarball:` field for any package that doesn't come from
 * the default registry, so "integrity and no tarball" means "from npm".
 */
export function checkLockfile(context: CheckContext): Report {
  const report = new Report("lockfile");
  if (!existsSync(join(context.root, lockfile))) {
    report.error(lockfile, "The lockfile is missing. Run pnpm install and commit pnpm-lock.yaml.");
    return report;
  }
  const text = context.read(lockfile);
  if (!/^lockfileVersion: '9\.\d+'$/m.test(text)) {
    report.error(
      lockfile,
      "Unexpected lockfile version; this check reads version 9. Update the check together with pnpm.",
    );
  }
  for (const entry of readLockedPackages(text)) {
    const problem = lockedPackageProblem(entry);
    if (problem !== undefined) {
      report.error(
        lockfile,
        `${problem} Only packages from registry.npmjs.org with a sha512 hash, and the pinned Node runtime, are allowed (plan 3.2).`,
        entry.line,
      );
    }
  }
  return report;
}
