/**
 * The Rust crates' part of THIRD-PARTY-NOTICES.txt (HAL-6289). Pure
 * functions: `cli/sbom.ts` runs `cargo metadata` and reads the files.
 *
 * The crates are the ones a binary links: walked from the workspace members
 * along normal dependencies for one target, so build scripts and dev
 * dependencies stay out. Proc-macro crates stay in, as an extra licence is
 * harmless and a missing one isn't. Each crate's licence must be allowed by
 * `deny.toml`, and each needs a licence text: its own file, or one stored in
 * `tooling/check/licence-texts/crates/`.
 */
import { dirname, join, resolve } from "node:path";
import type { DenyException } from "./deny.ts";
import { byCodePoint, type NoticeEntry } from "./sbom.ts";

/** The parts of a `cargo metadata --format-version 1` package this reads. */
export interface CargoPackage {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly license: string | null;
  readonly license_file: string | null;
  readonly authors: readonly string[];
  readonly repository: string | null;
  readonly homepage: string | null;
  readonly manifest_path: string;
}

/** One dependency edge of a resolve node. `kind` is `null` for a normal dependency. */
export interface CargoNodeDep {
  readonly pkg: string;
  readonly dep_kinds: readonly { readonly kind: string | null }[];
}

/** The parts of `cargo metadata --format-version 1` output this reads. */
export interface CargoMetadata {
  readonly packages: readonly CargoPackage[];
  readonly workspace_members: readonly string[];
  readonly resolve: {
    readonly nodes: readonly { readonly id: string; readonly deps: readonly CargoNodeDep[] }[];
  } | null;
}

/**
 * The third-party crates the workspace links: reached from the workspace
 * members along normal dependencies. The members themselves are ours and are
 * left out. Sorted by name and version.
 */
export function linkedCrates(metadata: CargoMetadata): CargoPackage[] {
  const members = new Set(metadata.workspace_members);
  const edges = new Map(
    (metadata.resolve?.nodes ?? []).map((node) => [
      node.id,
      node.deps
        .filter((dep) => dep.dep_kinds.some((kind) => kind.kind === null))
        .map((dep) => dep.pkg),
    ]),
  );
  const reached = new Set<string>();
  const queue = [...members];
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    if (!reached.has(id)) {
      reached.add(id);
      queue.push(...(edges.get(id) ?? []));
    }
  }
  return metadata.packages
    .filter((pkg) => reached.has(pkg.id) && !members.has(pkg.id))
    .sort((a, b) => byCodePoint(`${a.name}@${a.version}`, `${b.name}@${b.version}`));
}

type Expression =
  | { readonly kind: "licence"; readonly id: string }
  | { readonly kind: "and" | "or"; readonly parts: readonly Expression[] };

/** The words of an SPDX expression. The old `MIT/Apache-2.0` form reads as `OR`, as in cargo-deny. */
function tokens(expression: string): string[] {
  return expression
    .replaceAll("/", " OR ")
    .replaceAll("(", " ( ")
    .replaceAll(")", " ) ")
    .split(/\s+/)
    .filter((word) => word !== "");
}

const operators = new Set(["(", ")", "AND", "OR", "WITH"]);

/** Parses an SPDX licence expression, or throws when it isn't one. */
export function parseLicence(expression: string): Expression {
  const words = tokens(expression);
  let at = 0;
  const fail = (why: string): never => {
    throw new Error(`"${expression}" is not a licence expression: ${why}`);
  };
  const operand = (): Expression => {
    const word = words[at];
    at += 1;
    if (word === undefined) {
      return fail("it ends too early");
    }
    if (word === "(") {
      const inner = or();
      if (words[at] !== ")") {
        fail("a bracket is not closed");
      }
      at += 1;
      return inner;
    }
    if (operators.has(word)) {
      return fail(`unexpected "${word}"`);
    }
    return { kind: "licence", id: withException(word) };
  };
  /** `<licence> WITH <exception>` is one licence, as cargo-deny and deny.toml name it. */
  const withException = (licence: string): string => {
    if (words[at] !== "WITH") {
      return licence;
    }
    const exception = words[at + 1];
    if (exception === undefined || operators.has(exception)) {
      fail("WITH needs an exception name");
    }
    at += 2;
    return `${licence} WITH ${exception}`;
  };
  const series = (operator: "AND" | "OR", next: () => Expression): Expression => {
    const parts = [next()];
    while (words[at] === operator) {
      at += 1;
      parts.push(next());
    }
    return parts.length === 1
      ? (parts[0] as Expression)
      : { kind: operator === "AND" ? "and" : "or", parts };
  };
  const and = (): Expression => series("AND", operand);
  const or = (): Expression => series("OR", and);
  const parsed = or();
  if (at < words.length) {
    fail(`unexpected "${words[at]}"`);
  }
  return parsed;
}

/** Whether the expression is satisfied by the allowed licences: `OR` needs one branch, `AND` every part. */
export function licenceAllowed(expression: Expression, allowed: ReadonlySet<string>): boolean {
  if (expression.kind === "licence") {
    return allowed.has(expression.id);
  }
  return expression.kind === "and"
    ? expression.parts.every((part) => licenceAllowed(part, allowed))
    : expression.parts.some((part) => licenceAllowed(part, allowed));
}

/** A licence text stored for a crate that ships none. */
export interface StoredText {
  /** The crate version the text was checked for. */
  readonly version: string;
  readonly source: string;
  readonly text: string;
}

/**
 * Reads a stored licence text: the first line is `<crate> <version> <source URL>`,
 * the licence text follows. Throws when the first line isn't in that shape.
 */
export function parseStoredText(crate: string, file: string): StoredText {
  const normalised = file.replaceAll("\r\n", "\n");
  const end = normalised.indexOf("\n");
  const first = end === -1 ? normalised : normalised.slice(0, end);
  const [name, version, source, ...rest] = first.trim().split(/\s+/);
  if (name !== crate || version === undefined || source === undefined || rest.length > 0) {
    throw new Error(
      `the stored licence text for ${crate} must start with "${crate} <version> <source URL>"`,
    );
  }
  return { version, source, text: end === -1 ? "" : normalised.slice(end + 1).trimStart() };
}

/** What `cargoNoticeEntries` reads from disk, so tests can hand it files. */
export interface CrateFiles {
  /** The file names in a folder. */
  readonly list: (directory: string) => readonly string[];
  readonly read: (path: string) => string;
  /** The stored licence text for a crate, as the file reads, or `undefined`. */
  readonly stored: (crate: string) => string | undefined;
}

/** The licence allow-list of deny.toml. */
export interface LicencePolicy {
  readonly allow: readonly string[];
  readonly exceptions: readonly DenyException[];
}

const licenceFile = /^(licen[cs]e|copying|notice)(\.|-|_|$)/i;

/** The crate's own licence texts, or why the `license-file` its Cargo.toml names can't be read. */
function crateTexts(
  pkg: CargoPackage,
  files: CrateFiles,
): { texts: string[] } | { problem: string } {
  const directory = dirname(pkg.manifest_path);
  if (pkg.license_file !== null) {
    try {
      return { texts: [files.read(resolve(directory, pkg.license_file))] };
    } catch {
      return {
        problem: `${pkg.name}@${pkg.version}: can't read ${pkg.license_file}, the license-file its Cargo.toml names`,
      };
    }
  }
  return {
    texts: files
      .list(directory)
      .filter((file) => licenceFile.test(file))
      .sort()
      .map((file) => files.read(join(directory, file))),
  };
}

/** Why the crate's licence isn't allowed by deny.toml, or `undefined` when it is. */
function licenceProblem(pkg: CargoPackage, policy: LicencePolicy): string | undefined {
  const label = `${pkg.name}@${pkg.version}`;
  if (pkg.license === null) {
    return `${label} names no licence in its Cargo.toml`;
  }
  const allowed = new Set([
    ...policy.allow,
    ...policy.exceptions
      .filter((entry) => entry.crate === pkg.name)
      .flatMap((entry) => entry.allow),
  ]);
  try {
    return licenceAllowed(parseLicence(pkg.license), allowed)
      ? undefined
      : `${label} is under ${pkg.license}, which deny.toml does not allow for it`;
  } catch (error) {
    return `${label}: ${(error as Error).message}`;
  }
}

/** The stored text of a crate that ships no licence file, or why there is none to use. */
function storedText(pkg: CargoPackage, files: CrateFiles): { text: string } | { problem: string } {
  const path = `tooling/check/licence-texts/crates/${pkg.name}.txt`;
  const file = files.stored(pkg.name);
  if (file === undefined) {
    return {
      problem: `${pkg.name}@${pkg.version} ships no licence file: store its text in ${path}`,
    };
  }
  try {
    const stored = parseStoredText(pkg.name, file);
    return stored.version === pkg.version
      ? { text: stored.text }
      : {
          problem: `the stored licence text for ${pkg.name} is for ${stored.version}, Cargo.lock has ${pkg.version}: check the licence of ${pkg.version} and update ${path}`,
        };
  } catch (error) {
    return { problem: (error as Error).message };
  }
}

/** The stored text of a crate that ships no licence file, noting in `problems` when there is none to use. */
function storedTexts(pkg: CargoPackage, files: CrateFiles, problems: string[]): string[] {
  const stored = storedText(pkg, files);
  if ("text" in stored) {
    return [stored.text];
  }
  problems.push(stored.problem);
  return [];
}

/** The notice entries of the crates, and what is wrong with any of them. */
export function cargoNoticeEntries(
  crates: readonly CargoPackage[],
  policy: LicencePolicy,
  files: CrateFiles,
): { entries: NoticeEntry[]; problems: string[] } {
  const entries: NoticeEntry[] = [];
  const problems: string[] = [];
  for (const pkg of crates) {
    const problem = licenceProblem(pkg, policy);
    if (problem !== undefined) {
      problems.push(problem);
    }
    if (pkg.license === null) {
      continue;
    }
    const own = crateTexts(pkg, files);
    if ("problem" in own) {
      problems.push(own.problem);
      continue;
    }
    const texts = own.texts.length > 0 ? own.texts : storedTexts(pkg, files, problems);
    const homepage = pkg.repository ?? pkg.homepage;
    entries.push({
      name: pkg.name,
      versions: [pkg.version],
      licence: pkg.license,
      ...(pkg.authors.length === 0 ? {} : { author: pkg.authors.join(", ") }),
      ...(homepage === null ? {} : { homepage }),
      texts,
    });
  }
  return { entries, problems };
}
