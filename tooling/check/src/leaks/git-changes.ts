import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddedLine, Change, ChangedFile, ChangeText } from "./scan.ts";

/**
 * Reads changes from git in the shape the scanner wants: for each file,
 * only the lines it adds. One `git` call per scan keeps the hook fast.
 */

/** Runs git in the repo and returns its output. */
export function git(root: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 });
}

/**
 * Diff options that make the output the same on every machine, whatever
 * the person's own git config says (prefixes, colour, external diff tools).
 * The raw part lists every file, also empty and binary ones; the patch
 * part, without context lines, holds the added lines. `--text` makes git
 * show the lines of every file, also one that `.gitattributes` marks `-diff`
 * or `binary`, which a pull request can set to hide a file from the scan.
 */
const diffOptions = [
  "--patch-with-raw",
  "--unified=0",
  "--text",
  "--no-color",
  "--no-ext-diff",
  "--no-textconv",
  "--no-relative",
  "--src-prefix=a/",
  "--dst-prefix=b/",
  "--diff-filter=ACMR",
];

/** Undoes git's quoting of unusual file names: `"a\tb"` → a, tab, b. */
function unquote(path: string): string {
  if (!path.startsWith('"')) {
    return path;
  }
  const bytes: number[] = [];
  const inner = path.slice(1, -1);
  const escapes: Record<string, number> = {
    n: 10,
    t: 9,
    '"': 34,
    "\\": 92,
    a: 7,
    b: 8,
    f: 12,
    r: 13,
    v: 11,
  };
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index] ?? "";
    if (char !== "\\") {
      bytes.push(...Buffer.from(char));
    } else if (/[0-7]/.test(inner[index + 1] ?? "")) {
      bytes.push(Number.parseInt(inner.slice(index + 1, index + 4), 8));
      index += 3;
    } else {
      bytes.push(escapes[inner[index + 1] ?? ""] ?? 0);
      index += 1;
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/**
 * Parses the output of one diff (raw part, then patch) into changed files.
 * A merge commit comes as a combined diff (`diff --cc`), with one prefix
 * column per parent instead of one: `++new`, ` +from one side`, `- gone`.
 * A line is in the new file when no column says `-`, and added when one
 * says `+`. So an added line that itself starts with `++ ` is never
 * mistaken for a file header.
 */
export function parseDiff(output: string): ChangedFile[] {
  const state: DiffState = { files: new Map(), current: undefined, columns: 0, nextLine: 0 };
  for (const line of output.split("\n")) {
    readDiffLine(line, state);
  }
  return [...state.files].map(([path, lines]) => ({ path, lines }));
}

interface DiffState {
  readonly files: Map<string, AddedLine[]>;
  current: AddedLine[] | undefined;
  /** Prefix columns in the current hunk; 0 outside a hunk. */
  columns: number;
  nextLine: number;
}

function readDiffLine(line: string, state: DiffState): void {
  if (/^diff --(?:git|cc|combined) /.test(line)) {
    state.current = undefined;
    state.columns = 0;
  } else if (line.startsWith("@@")) {
    state.columns = (/^@+/.exec(line)?.[0].length ?? 2) - 1;
    state.nextLine = hunkStart(line);
  } else if (state.columns > 0) {
    readHunkLine(line, state);
  } else if (line.startsWith(":")) {
    // `:100644 100644 abc def M\tpath`, `R100\told\tnew` for a rename, `::…` for a merge.
    state.files.set(unquote(line.split("\t").at(-1) ?? ""), []);
  } else if (line.startsWith("+++ ")) {
    state.current = state.files.get(newPath(line));
  }
}

function readHunkLine(line: string, state: DiffState): void {
  const prefix = line.slice(0, state.columns);
  if (prefix.startsWith("\\") || prefix.includes("-")) {
    return; // "\ No newline at end of file", or a removed line
  }
  if (prefix.includes("+")) {
    state.current?.push({ number: state.nextLine, text: line.slice(state.columns) });
  }
  state.nextLine += 1;
}

/** The first line number in the new file: `@@ -3,2 +5,4 @@` → 5, also with `@@@ … @@@`. */
function hunkStart(header: string): number {
  return Number(/\+(\d+)/.exec(header)?.[1] ?? 0);
}

/** The path from a `+++ b/path` line. Git ends it with a tab when the name has a space. */
function newPath(header: string): string {
  return unquote(header.slice(4).replace(/\t$/, "")).replace(/^b\//, "");
}

/** The changes staged for the next commit (the pre-commit hook). */
export function stagedChanges(root: string): Change[] {
  const output = git(root, ["-c", "core.quotePath=false", "diff", "--cached", ...diffOptions]);
  return [{ commit: undefined, files: parseDiff(output), texts: [] }];
}

const commitStart = "\u001ecommit ";
const messageEnd = "\u001f";

/**
 * Every commit the revisions select, each with its message, author,
 * committer and the lines it adds (pre-push, CI, the history scan).
 *
 * @param revisions - `git log` revisions, such as `["base..head"]` or `["--all"]`
 */
export function commitChanges(root: string, revisions: readonly string[]): Change[] {
  const format = `--format=${commitStart}%h%n%an <%ae>%n%cn <%ce>%n%B${messageEnd}`;
  const output = git(root, [
    "-c",
    "core.quotePath=false",
    "log",
    format,
    ...diffOptions,
    // Show what a merge commit adds that neither side had, such as text
    // written while resolving a conflict. Without this, `git log` skips merges.
    "--diff-merges=dense-combined",
    ...revisions,
  ]);
  return output
    .split(commitStart)
    .filter((entry) => entry.trim() !== "")
    .map((entry) => {
      const [header = "", diff = ""] = entry.split(messageEnd);
      const [commit = "", author = "", committer = "", ...message] = header.split("\n");
      return {
        commit,
        files: parseDiff(diff),
        texts: [
          { label: "commit message", text: message.join("\n"), termsOnly: false },
          { label: "commit author", text: author, termsOnly: true },
          { label: "commit committer", text: committer, termsOnly: true },
        ],
      };
    });
}

/**
 * The name of every branch and tag, and each annotated tag's message and
 * tagger (the history scan). A tag is reported by its object's short hash,
 * so a name with a term in it is never printed.
 */
export function refChanges(root: string): Change[] {
  const fields = [
    "%(refname)",
    "%(objectname:short)",
    "%(objecttype)",
    "%(taggername) %(taggeremail)",
    "%(contents)",
  ];
  // No field can hold a NUL byte, so NULs split the output safely.
  const values = git(root, ["for-each-ref", `--format=${fields.join("%00")}%00`]).split("\0");
  const changes: Change[] = [];
  for (let index = 0; index + fields.length <= values.length; index += fields.length) {
    const [refName = "", commit = "", type = "", tagger = "", message = ""] = values
      .slice(index, index + fields.length)
      .map((value) => value.replace(/^\n/, ""));
    const texts: ChangeText[] = [{ label: "ref name", text: refName, termsOnly: false }];
    if (type === "tag") {
      texts.push(
        { label: "tag message", text: message, termsOnly: false },
        { label: "tagger", text: tagger, termsOnly: true },
      );
    }
    changes.push({ commit, files: [], texts });
  }
  return changes;
}

/** Every tracked file in the working tree, each line counted as added. */
export function treeChanges(root: string): Change[] {
  const files = git(root, ["ls-files", "-z"])
    .split("\0")
    .filter((path) => path !== "");
  const changed = files.map((path) => {
    let content: Buffer;
    try {
      content = readFileSync(join(root, path));
    } catch {
      return { path, lines: [] }; // deleted but not yet staged, or a submodule
    }
    const binary = content.subarray(0, 8000).includes(0);
    const lines = binary
      ? []
      : content
          .toString("utf8")
          .split("\n")
          .map((text, index) => ({ number: index + 1, text }));
    return { path, lines };
  });
  return [{ commit: undefined, files: changed, texts: [] }];
}
