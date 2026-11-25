/** One Dockerfile instruction, its continuation lines joined. */
export interface DockerInstruction {
  /** The keyword in upper case, e.g. `FROM`, `ADD`, `RUN`. */
  readonly keyword: string;
  /** Everything after the keyword, on one line. */
  readonly argument: string;
  /** The line the instruction starts on, from 1. */
  readonly line: number;
}

/** A heredoc marker such as `<<EOF`, `<<-EOF` or `<<"EOF"`; group 1 is its terminator. */
const heredocMarker = /<<-?\s*["']?([A-Za-z_][A-Za-z0-9_]*)["']?/g;

/**
 * Splits a Dockerfile into its instructions. Comment lines are dropped, also
 * inside a continued instruction, and a trailing `\` joins the next line. The
 * body of a heredoc (`RUN <<EOF` … `EOF`) is joined to its instruction with
 * `; `, so a check of the instruction sees every line of it.
 *
 * @example
 * readDockerInstructions("FROM a\nRUN b \\\n  c\n");
 * // [{ keyword: "FROM", argument: "a", line: 1 }, { keyword: "RUN", argument: "b c", line: 2 }]
 */
export function readDockerInstructions(text: string): DockerInstruction[] {
  const lines = text.split(/\r?\n/);
  const instructions: DockerInstruction[] = [];
  let pending: string[] = [];
  let startLine = 0;
  let index = 0;
  while (index < lines.length) {
    const trimmed = (lines[index] ?? "").trim();
    index += 1;
    if (trimmed.startsWith("#") || (trimmed === "" && pending.length === 0)) {
      continue;
    }
    if (pending.length === 0) {
      startLine = index;
    }
    const continues = trimmed.endsWith("\\");
    pending.push(continues ? trimmed.slice(0, -1).trim() : trimmed);
    if (continues) {
      continue;
    }
    const joined = pending.filter((part) => part !== "").join(" ");
    pending = [];
    const withBodies = joinHeredocBodies(joined, lines, index);
    index = withBodies.nextIndex;
    const instruction = toInstruction(withBodies.text, startLine);
    if (instruction !== undefined) {
      instructions.push(instruction);
    }
  }
  return instructions;
}

/**
 * Appends the body of every heredoc an instruction opens, from `lines[index]` on,
 * and returns the line after the last terminator.
 */
function joinHeredocBodies(
  text: string,
  lines: readonly string[],
  index: number,
): { text: string; nextIndex: number } {
  let joined = text;
  let next = index;
  for (const [, terminator] of [...text.matchAll(heredocMarker)]) {
    const body: string[] = [];
    // An unterminated heredoc runs to the end of the file, as Docker reads it.
    while (next < lines.length && (lines[next] ?? "").trim() !== terminator) {
      body.push((lines[next] ?? "").trim());
      next += 1;
    }
    next += 1;
    joined = [joined, ...body.filter((line) => line !== "")].join("; ");
  }
  return { text: joined, nextIndex: next };
}

/** Splits `KEYWORD argument` into an instruction; undefined for an empty text. */
export function toInstruction(text: string, line: number): DockerInstruction | undefined {
  const match = /^(\S+)\s*(.*)$/s.exec(text);
  if (match?.[1] === undefined) {
    return undefined;
  }
  return { keyword: match[1].toUpperCase(), argument: match[2] ?? "", line };
}

/** The words of an instruction's argument, split on spaces. */
export function words(argument: string): string[] {
  return argument.split(/\s+/).filter((word) => word !== "");
}

/** True for a path that names a Dockerfile (`Dockerfile`, `Dockerfile.dev`, `run.Dockerfile`), not its ignore file. */
export function isDockerfile(path: string): boolean {
  const name = path.split("/").at(-1) ?? "";
  if (name.endsWith(".dockerignore")) {
    return false;
  }
  return name === "Dockerfile" || name.startsWith("Dockerfile.") || name.endsWith(".Dockerfile");
}
