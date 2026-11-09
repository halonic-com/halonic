import { posix } from "node:path";

/**
 * Requirement files: one Markdown file per requirement, in a
 * `requirements/` folder next to the code that owns it.
 */

/** Where a requirement is in its life. Only `active` ones need a passing test. */
export type RequirementStatus = "draft" | "active" | "retired";

/** A requirement file that parsed cleanly. */
export interface Requirement {
  readonly id: string;
  readonly file: string;
  readonly status: RequirementStatus;
  readonly since: string;
  readonly source: string;
  /** The EARS sentence. */
  readonly statement: string;
  /** The Given/When/Then examples, one string each. */
  readonly examples: readonly string[];
}

/** A reason a requirement file is malformed, at a line of the file. */
export interface RequirementFileProblem {
  readonly line: number;
  readonly message: string;
}

/** What parsing one file gives: the requirement, or why it is malformed. */
export type ParsedRequirement =
  | { readonly ok: true; readonly requirement: Requirement }
  | { readonly ok: false; readonly problems: readonly RequirementFileProblem[] };

const statuses: readonly RequirementStatus[] = ["draft", "active", "retired"];
const fieldNames = ["Status", "Since", "Source"] as const;
type FieldName = (typeof fieldNames)[number];

/** The five EARS sentence shapes, by their opening word. */
const earsOpenings = ["The ", "When ", "While ", "If ", "Where "];

const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** True for a Markdown file directly inside a `requirements/` folder. */
export function isRequirementFile(file: string): boolean {
  return /(?:^|\/)requirements\/[^/]+\.md$/.test(file);
}

/**
 * The ID a requirement file must have, from its path: the
 * package folder's name, the folders between the package (or its `src/`)
 * and `requirements/`, then the file name.
 *
 * @param file - the requirement file, relative to the repo root
 * @param packageDirectory - the folder of the package that owns it
 *
 * @example
 * expectedRequirementId(
 *   "packages/studio/features/agents/src/explorer/requirements/filter-by-hub.md",
 *   "packages/studio/features/agents",
 * ); // "agents.explorer.filter-by-hub"
 */
export function expectedRequirementId(file: string, packageDirectory: string): string {
  const packageName = posix.basename(packageDirectory);
  const inside = file.slice(packageDirectory.length + 1).split("/");
  const fileName = (inside.pop() ?? "").replace(/\.md$/, "");
  inside.pop(); // the requirements/ folder itself
  if (inside[0] === "src") {
    inside.shift();
  }
  return [packageName, ...inside, fileName].join(".");
}

/**
 * Parses a requirement file in this format:
 *
 * ```markdown
 * # workflow.timer-fires-after-delay
 *
 * - Status: active
 * - Since: 0.1.0
 * - Source: HAL-42
 *
 * When the delay of a timer has passed, the engine shall fire it once.
 *
 * ## Examples
 * - Given a timer of 5 minutes, when 5 minutes pass, then it fires once.
 * ```
 *
 * @param file - the path, relative to the repo root, for the result
 * @param text - the file's contents
 * @param expectedId - the ID its path gives, see {@link expectedRequirementId}
 */
export function parseRequirementFile(
  file: string,
  text: string,
  expectedId: string,
): ParsedRequirement {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const problems: RequirementFileProblem[] = [];
  const fail = (line: number, message: string): void => {
    problems.push({ line, message });
  };

  const heading = /^# (\S+)\s*$/.exec(lines[0] ?? "");
  const id = heading?.[1];
  if (id === undefined) {
    fail(1, `The first line must be "# ${expectedId}".`);
  } else if (id !== expectedId) {
    fail(1, `The ID "${id}" doesn't match the file's path, which gives "${expectedId}".`);
  }

  const examplesAt = lines.findIndex((line) => /^## Examples\s*$/.test(line));
  const headerEnd = examplesAt === -1 ? lines.length : examplesAt;
  const fields = readFields(lines, headerEnd, fail);
  const statement = readStatement(lines, headerEnd, fail);
  const examples = examplesAt === -1 ? [] : readExamples(lines, examplesAt, fail);
  if (examplesAt === -1) {
    fail(lines.length, 'Add a "## Examples" section with at least one Given/When/Then example.');
  } else if (examples.length === 0) {
    fail(examplesAt + 1, 'The "## Examples" section has no "- Given …" example.');
  }

  const status = fields.get("Status");
  const since = fields.get("Since");
  const source = fields.get("Source");
  if (
    problems.length > 0 ||
    id === undefined ||
    status === undefined ||
    since === undefined ||
    source === undefined ||
    statement === undefined
  ) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    requirement: {
      id,
      file,
      status: status as RequirementStatus,
      since,
      source,
      statement,
      examples,
    },
  };
}

type Fail = (line: number, message: string) => void;

function readFields(
  lines: readonly string[],
  headerEnd: number,
  fail: Fail,
): Map<FieldName, string> {
  const fields = new Map<FieldName, string>();
  for (let index = 1; index < headerEnd; index++) {
    const match = /^- ([A-Za-z]+):\s*(.*?)\s*$/.exec(lines[index] ?? "");
    if (match === null) {
      continue;
    }
    const name = match[1] ?? "";
    const value = match[2] ?? "";
    const problem = fieldProblem(fields, name, value);
    if (problem === undefined) {
      fields.set(name as FieldName, value);
    } else {
      fail(index + 1, problem);
    }
  }
  for (const name of fieldNames) {
    if (!fields.has(name) && !hasFieldLine(lines, headerEnd, name)) {
      fail(1, `The "- ${name}: …" line is missing.`);
    }
  }
  return fields;
}

/** What is wrong with a `- Name: value` line, or `undefined` when it is fine. */
function fieldProblem(
  fields: ReadonlyMap<FieldName, string>,
  name: string,
  value: string,
): string | undefined {
  if (!isFieldName(name)) {
    return `Unknown field "${name}". Use ${fieldNames.join(", ")}.`;
  }
  if (fields.has(name)) {
    return `"${name}" appears twice.`;
  }
  if (value === "") {
    return `"${name}" is empty.`;
  }
  if (name === "Status" && !statuses.includes(value as RequirementStatus)) {
    return `Status "${value}" is not one of ${statuses.join(", ")}.`;
  }
  if (name === "Since" && !versionPattern.test(value)) {
    return `Since "${value}" is not a version such as 0.1.0.`;
  }
  return undefined;
}

function isFieldName(name: string): name is FieldName {
  return (fieldNames as readonly string[]).includes(name);
}

function hasFieldLine(lines: readonly string[], headerEnd: number, name: string): boolean {
  return lines.slice(1, headerEnd).some((line) => line.startsWith(`- ${name}:`));
}

/** The EARS sentence: the text between the fields and `## Examples`. */
function readStatement(
  lines: readonly string[],
  headerEnd: number,
  fail: Fail,
): string | undefined {
  const parts: string[] = [];
  let firstLine = 0;
  for (let index = 1; index < headerEnd; index++) {
    const line = lines[index] ?? "";
    if (line.trim() === "" || line.startsWith("- ")) {
      continue;
    }
    if (firstLine === 0) {
      firstLine = index + 1;
    }
    parts.push(line.trim());
  }
  const statement = parts.join(" ");
  if (statement === "") {
    fail(Math.max(1, headerEnd), "The requirement sentence (EARS) is missing.");
    return undefined;
  }
  if (!earsOpenings.some((opening) => statement.startsWith(opening))) {
    fail(
      firstLine,
      'The sentence must have an EARS shape: it starts with "The", "When", "While", "If" or "Where".',
    );
  }
  if (!/\bshall\b/.test(statement)) {
    fail(firstLine, 'The sentence must say what the system "shall" do (EARS).');
  }
  if (statement.startsWith("If ") && !/\bthen\b/.test(statement)) {
    fail(firstLine, 'An "If" requirement reads "If …, then the … shall …" (EARS).');
  }
  return statement;
}

/** The examples: each `- Given …` bullet, with its indented follow-on lines. */
function readExamples(lines: readonly string[], examplesAt: number, fail: Fail): string[] {
  const examples: string[] = [];
  let current: { text: string; line: number } | undefined;
  const finish = (): void => {
    if (current === undefined) {
      return;
    }
    if (!/\bthen\b/i.test(current.text)) {
      fail(current.line, 'Each example says what happens: "Given …, (when …,) then …".');
    }
    examples.push(current.text);
    current = undefined;
  };
  for (let index = examplesAt + 1; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (line.startsWith("- ")) {
      finish();
      if (!line.startsWith("- Given ")) {
        fail(index + 1, 'Each example starts with "Given".');
        continue;
      }
      current = { text: line.slice(2).trim(), line: index + 1 };
    } else if (line.startsWith("  ") && current !== undefined) {
      current.text += ` ${line.trim()}`;
    } else if (line.startsWith("#")) {
      finish();
      break;
    }
  }
  finish();
  return examples;
}
