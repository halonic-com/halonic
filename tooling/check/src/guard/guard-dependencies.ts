/**
 * The npm dependency the guard runs. Its code parses test files with
 * `@typescript/typescript6`, and the version comes from the catalog in
 * `pnpm-workspace.yaml` and the resolution in `pnpm-lock.yaml`. Neither
 * file is a guarded path, since lockfile changes are very frequent, so only
 * the lines that decide this package count as a change to the guard
 * (HAL-7719). `vitest` and the other dev dependencies of `tooling/check` only
 * run the guard's own tests, so they stay out.
 */
export const guardDependency = "@typescript/typescript6";

/** The files a change to `guardDependency` can show up in. */
export const guardDependencyFiles: readonly string[] = ["pnpm-workspace.yaml", "pnpm-lock.yaml"];

/** The package folder whose importer entry in the lockfile is the guard's. */
const importer = "tooling/check";

/**
 * Whether the part of `file` that decides `guardDependency` differs between
 * `before` and `after`. A file that is added or deleted counts when it
 * carries the dependency. A file whose layout the reader doesn't know counts
 * as changed on any difference, so a format change can't hide the dependency.
 */
export function guardDependencyChanged(
  file: string,
  before: string | undefined,
  after: string | undefined,
): boolean {
  if (before === after) {
    return false;
  }
  const facts = file === "pnpm-lock.yaml" ? lockfileFacts : catalogFacts;
  return facts(before) !== facts(after);
}

/** The catalog line for the dependency, or "" if there is none. */
function catalogFacts(text: string | undefined): string | undefined {
  if (text === undefined) {
    return undefined;
  }
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trimEnd() === "catalog:");
  if (start === -1) {
    return text;
  }
  const section = block(lines, start);
  return section.filter((line) => keyOf(line) === guardDependency).join("\n");
}

/** The lockfile entries that resolve the dependency, one level of its own dependencies included. */
function lockfileFacts(text: string | undefined): string | undefined {
  if (text === undefined) {
    return undefined;
  }
  // pnpm writes the lockfile as two documents when it has config dependencies;
  // the packages are in the last one.
  const all = text.split("\n");
  const lines = all.slice(
    Math.max(
      0,
      all.findLastIndex((line) => line.startsWith("lockfileVersion:")),
    ),
  );
  const section = (name: string): string[] => {
    const start = lines.findIndex((line) => line.trimEnd() === `${name}:`);
    return start === -1 ? [] : block(lines, start);
  };
  const importers = section("importers");
  const own = importers.findIndex((line) => keyOf(line) === importer);
  if (own === -1 || section("packages").length === 0) {
    return text;
  }
  const ownBlock = block(importers, own);
  const dependency = ownBlock.findIndex((line) => keyOf(line) === guardDependency);
  if (dependency === -1) {
    return "";
  }
  const entry = block(ownBlock, dependency);
  const version = entry
    .map((line) => /^\s+version:\s*(\S+?)(?:\(|$)/.exec(line)?.[1])
    .find((value) => value !== undefined);
  const packages = [...section("packages"), ...section("snapshots")];
  const blocksOf = (id: string): string[] =>
    packages.flatMap((line, index) => (keyOf(line) === id ? block(packages, index) : []));
  const resolved = blocksOf(`${guardDependency}@${version}`);
  const below = resolved
    .filter((line) => /^ {6}\S/.test(line))
    .flatMap((line) => {
      const [name, spec] = [keyOf(line), line.slice(line.indexOf(":") + 1).trim()];
      return blocksOf(spec.includes("@") ? spec : `${name}@${spec}`);
    });
  return [...entry, ...resolved, ...below].filter((line) => line.trim() !== "").join("\n");
}

/** The key a line starts a mapping entry with, without quotes. */
function keyOf(line: string): string | undefined {
  const match = /^\s*(['"]?)([^\s'"][^'"]*?)\1:(?:\s|$)/.exec(line);
  return match?.[2];
}

/** The line at `start` and the more deeply indented lines that follow it. */
function block(lines: readonly string[], start: number): string[] {
  const indent = (line: string): number => line.length - line.trimStart().length;
  const head = lines[start] ?? "";
  const rest: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && indent(line) <= indent(head)) {
      break;
    }
    rest.push(line);
  }
  return [head, ...rest];
}
