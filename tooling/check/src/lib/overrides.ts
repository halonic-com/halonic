/**
 * Reads `overrides-allowed.json`, the only list of `overrides:` that
 * `pnpm-workspace.yaml` may carry, and checks the workspace file against it.
 * An override rewrites the dependency tree around the catalog, so each one
 * is a security fix for one parent's copy of a package, with a reason and a
 * condition for removing it. Strict like the other config files.
 */
import type { CatalogEntry } from "./catalog.ts";

/** One allowed override. */
export interface AllowedOverride {
  /** The `parent>child` key as written under `overrides:`. */
  readonly selector: string;
  /** The GitHub advisory ID the override fixes. */
  readonly advisory: string;
  readonly reason: string;
  /** What lets us delete the override and the entry. */
  readonly removeWhen: string;
}

const known = ["selector", "advisory", "reason", "remove-when"];
const ghsaId = /^GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}$/;
const packageName = "(?:@[a-z0-9][\\w.-]*/)?[a-z0-9][\\w.-]*";
/** `parent>child`, both plain package names: no bare name, no version selector, no chain. */
const parentScoped = new RegExp(`^(${packageName})>(${packageName})$`);
const minReasonLength = 20;

/** The entries of the file and everything wrong with it. */
export interface OverridesReading {
  readonly entries: readonly AllowedOverride[];
  readonly problems: readonly string[];
}

/** Reads the file text; without a problem, `entries` is complete. */
export function readAllowedOverrides(text: string): OverridesReading {
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
  const entries: AllowedOverride[] = [];
  const seen = new Set<string>();
  (file["allowed"] as unknown[]).forEach((raw, index) => {
    const entry = readEntry(raw, `allowed[${index}]`, problems);
    if (entry === undefined) {
      return;
    }
    if (seen.has(entry.selector)) {
      problems.push(`allowed[${index}] repeats ${entry.selector}`);
    }
    seen.add(entry.selector);
    entries.push(entry);
  });
  return { entries, problems };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readEntry(raw: unknown, at: string, problems: string[]): AllowedOverride | undefined {
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
  const selector = text("selector");
  if (selector !== "" && !parentScoped.test(selector)) {
    problems.push(
      `${at}.selector "${selector}" must be parent>child, two package names. A bare name would rewrite every copy in the tree`,
    );
  }
  const advisory = text("advisory");
  if (advisory !== "" && !ghsaId.test(advisory)) {
    problems.push(`${at}.advisory "${advisory}" must look like GHSA-xxxx-xxxx-xxxx`);
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
  return { selector, advisory, reason, removeWhen };
}

/**
 * Problems with the `overrides:` lines of the workspace file, each with its
 * line: a selector that isn't allowed, and a value other than the catalog
 * version of the child. `stale` lists the allowed entries that no override
 * uses any more.
 */
export function overrideProblems(
  overrides: readonly CatalogEntry[],
  allowed: readonly AllowedOverride[],
  catalog: readonly CatalogEntry[],
): { problems: { message: string; line: number }[]; stale: string[] } {
  const problems: { message: string; line: number }[] = [];
  const allowedSelectors = new Set(allowed.map((entry) => entry.selector));
  const versionOf = new Map(catalog.map((entry) => [entry.name, entry.version]));
  for (const override of overrides) {
    if (!allowedSelectors.has(override.name)) {
      problems.push({
        message: `"overrides: ${override.name}" rewrites the dependency tree around the catalog and dependencies.json, so it isn't allowed. A security fix needs an entry in tooling/check/overrides-allowed.json, proposed in its own pull request.`,
        line: override.line,
      });
      continue;
    }
    const child = parentScoped.exec(override.name)?.[2] ?? "";
    const catalogVersion = versionOf.get(child);
    if (override.version !== "catalog:" && override.version !== catalogVersion) {
      problems.push({
        message: `"overrides: ${override.name}: ${override.version}" must match the catalog version of "${child}" (${catalogVersion ?? "not in the catalog"}), or be "catalog:". The catalog stays the one place for versions.`,
        line: override.line,
      });
    }
  }
  const used = new Set(overrides.map((override) => override.name));
  const stale = allowed
    .filter((entry) => !used.has(entry.selector))
    .map(
      (entry) =>
        `"${entry.selector}" is allowed but pnpm-workspace.yaml has no such override. Remove the entry (remove-when: ${entry.removeWhen}).`,
    );
  return { problems, stale };
}
