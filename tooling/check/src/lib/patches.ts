/**
 * Reads `patches-allowed.json`, the only list of `patchedDependencies:` that
 * `pnpm-workspace.yaml` may carry, and checks the workspace file against it.
 * A patch changes what an approved package contains, so each one is listed
 * with its package at the catalog version, its file, the SHA-256 of that
 * file, a reason and a condition for removing it. The hash means a changed
 * patch needs a changed list, and CI reads the list from the base commit, so
 * a pull request can't approve its own patch. Strict like the other config
 * files.
 */
import { createHash } from "node:crypto";
import type { CatalogEntry } from "./catalog.ts";

/** One allowed patch. */
export interface AllowedPatch {
  /** The `name@version` key as written under `patchedDependencies:`. */
  readonly package: string;
  /** The patch file, relative to the repo root, as written there. */
  readonly file: string;
  /** The SHA-256 of the patch file, in lower-case hex. */
  readonly sha256: string;
  readonly reason: string;
  /** What lets us delete the patch and the entry. */
  readonly removeWhen: string;
}

const known = ["package", "file", "sha256", "reason", "remove-when"];
const packageName = "(?:@[a-z0-9][\\w.-]*/)?[a-z0-9][\\w.-]*";
/** `name@version` with an exact version: a range would patch whatever version comes next. */
const exactPackage = new RegExp(`^(${packageName})@(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?)$`);
const patchFile = /^patches\/[\w@.+-]+\.patch$/;
const sha256Hex = /^[0-9a-f]{64}$/;
const minReasonLength = 20;

/** The entries of the file and everything wrong with it. */
export interface PatchesReading {
  readonly entries: readonly AllowedPatch[];
  readonly problems: readonly string[];
}

/** Reads the file text; without a problem, `entries` is complete. */
export function readAllowedPatches(text: string): PatchesReading {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { entries: [], problems: ["the file isn't valid JSON"] };
  }
  const file = asRecord(value);
  if (file === undefined || !Array.isArray(file["allowed"])) {
    return { entries: [], problems: ['the file must be an object with an "allowed" list'] };
  }
  const problems: string[] = [];
  const unknownTop = Object.keys(file).find((key) => key !== "allowed" && key !== "//");
  if (unknownTop !== undefined) {
    problems.push(`"${unknownTop}" is not a known setting (known: allowed)`);
  }
  const entries: AllowedPatch[] = [];
  const seen = new Set<string>();
  (file["allowed"] as unknown[]).forEach((raw, index) => {
    const entry = readEntry(raw, `allowed[${index}]`, problems);
    if (entry === undefined) {
      return;
    }
    if (seen.has(entry.package)) {
      problems.push(`allowed[${index}] repeats ${entry.package}`);
    }
    seen.add(entry.package);
    entries.push(entry);
  });
  return { entries, problems };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readEntry(raw: unknown, at: string, problems: string[]): AllowedPatch | undefined {
  const record = asRecord(raw);
  if (record === undefined) {
    problems.push(`${at} must be an object`);
    return undefined;
  }
  const before = problems.length;
  for (const key of Object.keys(record)) {
    if (key !== "//" && !known.includes(key)) {
      problems.push(`${at}.${key} is not a known field (known: ${known.join(", ")})`);
    }
  }
  const text = (key: string): string => {
    const field = record[key];
    if (typeof field !== "string" || field.trim() === "") {
      problems.push(`${at}.${key} is missing or not a non-empty string`);
      return "";
    }
    return field;
  };
  const pkg = text("package");
  if (pkg !== "" && !exactPackage.test(pkg)) {
    problems.push(`${at}.package "${pkg}" must be name@version, with an exact version`);
  }
  const file = text("file");
  if (file !== "" && !patchFile.test(file)) {
    problems.push(`${at}.file "${file}" must be a .patch file directly in patches/`);
  }
  const sha256 = text("sha256");
  if (sha256 !== "" && !sha256Hex.test(sha256)) {
    problems.push(`${at}.sha256 must be 64 lower-case hex digits`);
  }
  const reason = text("reason");
  if (reason !== "" && reason.trim().length < minReasonLength) {
    problems.push(
      `${at}.reason must explain the decision (at least ${minReasonLength} characters)`,
    );
  }
  const removeWhen = text("remove-when");
  if (problems.length > before) {
    return undefined;
  }
  return { package: pkg, file, sha256, reason, removeWhen };
}

/**
 * The SHA-256 of a patch file's text, as `patches-allowed.json` records it.
 * Line ends count as `\n`, so a Windows checkout gets the same hash.
 */
export function patchHash(text: string): string {
  return createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
}

/**
 * Problems with the `patchedDependencies:` lines of the workspace file, each
 * with its line: a patch that isn't allowed, one for a version other than the
 * catalog's, another file than the listed one, and a file whose hash differs
 * from the listed one. `readPatch` returns a patch file's text, or `undefined`
 * when there is no such file. `unused` lists the allowed entries that no
 * patch uses any more.
 */
export function patchProblems(
  patches: readonly CatalogEntry[],
  allowed: readonly AllowedPatch[],
  catalog: readonly CatalogEntry[],
  readPatch: (file: string) => string | undefined,
): { problems: { message: string; line: number }[]; unused: string[] } {
  const problems: { message: string; line: number }[] = [];
  const allowedByPackage = new Map(allowed.map((entry) => [entry.package, entry]));
  const versionOf = new Map(catalog.map((entry) => [entry.name, entry.version]));
  for (const patch of patches) {
    const entry = allowedByPackage.get(patch.name);
    if (entry === undefined) {
      problems.push({
        message: `"patchedDependencies: ${patch.name}" changes what an approved package contains, so it isn't allowed. A patch needs an entry in tooling/check/patches-allowed.json, proposed in its own pull request.`,
        line: patch.line,
      });
      continue;
    }
    const [, name = "", version = ""] = exactPackage.exec(patch.name) ?? [];
    if (versionOf.get(name) !== version) {
      problems.push({
        message: `"patchedDependencies: ${patch.name}" must patch the catalog version of "${name}" (${versionOf.get(name) ?? "not in the catalog"}). A new version needs its patch reviewed again.`,
        line: patch.line,
      });
    }
    if (patch.version !== entry.file) {
      problems.push({
        message: `"patchedDependencies: ${patch.name}" must use ${entry.file}, the file patches-allowed.json lists.`,
        line: patch.line,
      });
      continue;
    }
    const text = readPatch(entry.file);
    if (text === undefined) {
      problems.push({ message: `${entry.file} is missing.`, line: patch.line });
    } else if (patchHash(text) !== entry.sha256) {
      problems.push({
        message: `${entry.file} isn't the patch patches-allowed.json approved (its SHA-256 differs). A changed patch needs the new hash in the list, proposed in its own pull request.`,
        line: patch.line,
      });
    }
  }
  const used = new Set(patches.map((patch) => patch.name));
  const unused = allowed
    .filter((entry) => !used.has(entry.package))
    .map(
      (entry) =>
        `"${entry.package}" is allowed but pnpm-workspace.yaml has no such patch. Remove the entry if it's no longer needed (remove-when: ${entry.removeWhen}).`,
    );
  return { problems, unused };
}
