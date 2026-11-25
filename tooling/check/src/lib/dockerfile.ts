/** One Dockerfile instruction, its continuation lines joined. */
export interface DockerInstruction {
  /** The keyword in upper case, e.g. `FROM`, `ADD`, `RUN`. */
  readonly keyword: string;
  /** Everything after the keyword, on one line. */
  readonly argument: string;
  /** The line the instruction starts on, from 1. */
  readonly line: number;
}

/**
 * Splits a Dockerfile into its instructions. Comment lines are dropped, also
 * inside a continued instruction, and a trailing `\` joins the next line.
 *
 * @example
 * readDockerInstructions("FROM a\nRUN b \\\n  c\n");
 * // [{ keyword: "FROM", argument: "a", line: 1 }, { keyword: "RUN", argument: "b c", line: 2 }]
 */
export function readDockerInstructions(text: string): DockerInstruction[] {
  const instructions: DockerInstruction[] = [];
  let pending: string[] = [];
  let startLine = 0;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("#") || (trimmed === "" && pending.length === 0)) {
      continue;
    }
    if (pending.length === 0) {
      startLine = index + 1;
    }
    const continues = trimmed.endsWith("\\");
    pending.push(continues ? trimmed.slice(0, -1).trim() : trimmed);
    if (continues) {
      continue;
    }
    const joined = pending.filter((part) => part !== "").join(" ");
    pending = [];
    const match = /^(\S+)\s*(.*)$/.exec(joined);
    if (match?.[1] !== undefined) {
      instructions.push({
        keyword: match[1].toUpperCase(),
        argument: match[2] ?? "",
        line: startLine,
      });
    }
  }
  return instructions;
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
