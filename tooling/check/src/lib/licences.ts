/**
 * The licence check: exact SPDX IDs, with `OR`, `AND`, `WITH` and
 * parentheses understood. Shipped code and dev tooling have separate lists.
 */

/** The contents of `tooling/check/licences.json`. */
export interface LicencePolicy {
  /** Allowed in code we ship: the app and the CLI bundle. */
  readonly shipped: readonly string[];
  /** Allowed on top of `shipped` for build and dev tooling only. */
  readonly devOnly: readonly string[];
  /** Packages whose licence field is wrong upstream, checked by hand: `name@version` → SPDX ID. */
  readonly corrections: Readonly<Record<string, string>>;
  /** Third-party files copied into `packages/` or `apps/`, each reviewed by Julian. */
  readonly vendored?: readonly VendoredFile[];
}

/** One third-party file checked in as source, with where it came from. */
export interface VendoredFile {
  /** The file, relative to the repo root. */
  readonly path: string;
  /** What the release notices call it. */
  readonly name: string;
  /** Its SPDX ID. */
  readonly licence: string;
  /** Where the file comes from. */
  readonly source: string;
  /** The task that accepted it. */
  readonly task: string;
}

/** One installed package and its declared licence. */
export interface InstalledPackage {
  readonly name: string;
  readonly versions: readonly string[];
  readonly licence: string;
}

function tokenize(expression: string): string[] {
  return expression.replace(/[()]/g, " $& ").trim().split(/\s+/).filter(Boolean);
}

/**
 * True when a licence expression can be satisfied with allowed licences:
 * one side of an `OR` is enough, both sides of an `AND` are needed.
 * `WITH` exceptions are judged by their licence. Anything unparsable is false.
 *
 * @example
 * isAllowedExpression("(MIT OR GPL-3.0)", new Set(["MIT"])) // true
 */
export function isAllowedExpression(expression: string, allowed: ReadonlySet<string>): boolean {
  const tokens = tokenize(expression);
  let position = 0;
  const parseOr = (): boolean => {
    let result = parseAnd();
    while (tokens[position]?.toUpperCase() === "OR") {
      position += 1;
      const right = parseAnd();
      result = result || right;
    }
    return result;
  };
  const parseAnd = (): boolean => {
    let result = parseTerm();
    while (tokens[position]?.toUpperCase() === "AND") {
      position += 1;
      const right = parseTerm();
      result = result && right;
    }
    return result;
  };
  const parseTerm = (): boolean => {
    const token = tokens[position];
    position += 1;
    if (token === "(") {
      const inner = parseOr();
      if (tokens[position] !== ")") {
        throw new Error("unbalanced parentheses");
      }
      position += 1;
      return inner;
    }
    if (token === undefined || token === ")") {
      throw new Error("missing licence");
    }
    if (tokens[position]?.toUpperCase() === "WITH") {
      position += 2;
    }
    return allowed.has(token);
  };
  try {
    const result = parseOr();
    return position === tokens.length && result;
  } catch {
    return false;
  }
}

/** The packages whose licence isn't on the list, with a message that says what to do. */
export function findLicenceProblems(
  installed: readonly InstalledPackage[],
  policy: LicencePolicy,
  kind: "shipped" | "dev",
): string[] {
  const allowed = new Set(
    kind === "shipped" ? policy.shipped : [...policy.shipped, ...policy.devOnly],
  );
  const problems: string[] = [];
  for (const key of Object.keys(policy.corrections)) {
    if (!/^.+@[^@]+$/.test(key)) {
      problems.push(
        `tooling/check/licences.json: the correction "${key}" needs a version, as "name@version". A correction for a name alone would also cover versions nobody checked.`,
      );
    }
  }
  for (const pkg of installed) {
    for (const version of pkg.versions) {
      const licence = policy.corrections[`${pkg.name}@${version}`] ?? pkg.licence;
      if (!isAllowedExpression(licence, allowed)) {
        const where = kind === "shipped" ? "code we ship" : "dev tooling";
        problems.push(
          `${pkg.name}@${version} is licensed "${licence}", which isn't allowed in ${where}. Pick another package, or ask Julian to review the licence and add it to tooling/check/licences.json.`,
        );
      }
    }
  }
  return problems;
}

/** Our own licence: an SPDX tag with this ID is ours, any other is third-party. */
export const ownLicence = "Apache-2.0";

/** Between two words of a licence name: spaces, line breaks and comment marks. */
const gap = String.raw`[\s#*/;!-]+`;

/** A line that only comments, in the comment styles our files use. */
const commentLine = /^(?:\/\/|#|\/\*|\*|<!--|-->|--|;|@?rem\b|::)/i;

/**
 * The comment block at the top of a file: its licence header, if it has one.
 * It ends at the first line of code, so code that merely mentions a licence,
 * such as a script that writes one, isn't mistaken for a header.
 */
export function leadingComments(text: string): string {
  const lines: string[] = [];
  let inBlock = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!inBlock && line !== "" && !line.startsWith("#!") && !commentLine.test(line)) {
      break;
    }
    lines.push(line);
    if (line.startsWith("/*") || line.startsWith("<!--")) {
      inBlock = true;
    }
    if (inBlock && (line.endsWith("*/") || line.endsWith("-->"))) {
      inBlock = false;
    }
  }
  return lines.join("\n");
}

const thirdPartyMarks: readonly { readonly pattern: RegExp; readonly label: string }[] = [
  // A tag starts its comment line; a comment that only mentions `@license` in
  // a sentence, like the script that writes the public suffix list, isn't one.
  { pattern: /^[\s#*/;!<-]*@licen[cs]e\b/im, label: "an @license tag" },
  {
    pattern: new RegExp(`Mozilla${gap}Public${gap}License`, "i"),
    label: "the Mozilla Public License",
  },
  {
    pattern: new RegExp(
      `GNU${gap}(?:(?:Lesser|Library|Affero)${gap})?General${gap}Public${gap}License`,
      "i",
    ),
    label: "a GNU General Public License",
  },
];

/** What in a file's header says it is under someone else's licence, or undefined. */
export function thirdPartyLicenceMark(text: string): string | undefined {
  const header = leadingComments(text);
  for (const { pattern, label } of thirdPartyMarks) {
    if (pattern.test(header)) {
      return label;
    }
  }
  for (const match of header.matchAll(/SPDX-License-Identifier:([^\n]*)/g)) {
    const expression = (match[1] ?? "").replace(/\*\/|-->/g, "").trim();
    if (expression !== ownLicence) {
      return `the SPDX tag "${expression}"`;
    }
  }
  return undefined;
}

/** Where the full text of a vendored file's licence lives, for the release notices. */
export function licenceTextPath(licence: string): string {
  return `tooling/check/licence-texts/${licence}.txt`;
}

const vendoredFields = ["path", "name", "licence", "source", "task"] as const;

/**
 * The problems with vendored files: a file under `packages/` or `apps/` whose
 * header names a third-party licence and isn't on the `vendored` list, and a
 * `vendored` entry that is incomplete, whose file is gone or whose licence
 * text is missing from `tooling/check/licence-texts/`. `files` are the
 * repo's files, relative to the root; `read` returns one file's text.
 */
export function findVendoredProblems(
  files: readonly string[],
  read: (path: string) => string,
  policy: LicencePolicy,
): string[] {
  const present = new Set(files);
  const entries = policy.vendored ?? [];
  const problems = entries.flatMap((entry) => entryProblems(entry, present));
  const listed = new Set(entries.map((entry) => entry.path));
  for (const file of files) {
    if (!/^(packages|apps)\//.test(file) || listed.has(file)) {
      continue;
    }
    const mark = thirdPartyLicenceMark(read(file));
    if (mark !== undefined) {
      problems.push(
        `${file} carries ${mark} in its header, so it looks like a third-party file. Ask Julian to review its licence and add it to "vendored" in tooling/check/licences.json, or remove the file.`,
      );
    }
  }
  return problems;
}

/** What is wrong with one `vendored` entry, given the repo's files. */
function entryProblems(entry: VendoredFile, present: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const missing = vendoredFields.filter((field) => {
    const value: unknown = entry[field];
    return typeof value !== "string" || value.trim() === "";
  });
  if (missing.length > 0) {
    problems.push(
      `tooling/check/licences.json: the vendored entry "${String(entry.path)}" needs ${missing.join(", ")}.`,
    );
  }
  if (typeof entry.path === "string" && !present.has(entry.path)) {
    problems.push(
      `tooling/check/licences.json: the vendored file ${entry.path} is gone. Remove its entry, or fix the path if the file moved.`,
    );
  }
  if (typeof entry.licence === "string" && !present.has(licenceTextPath(entry.licence))) {
    problems.push(
      `tooling/check/licences.json: the vendored file ${String(entry.path)} is under ${entry.licence}, but ${licenceTextPath(entry.licence)} is missing. Add the licence's full text there, for the release notices.`,
    );
  }
  return problems;
}
