import type { ProcessRow } from "./process-tree.ts";

/** The process table, and the program started to read it, if there was one. */
export interface ProcessTable {
  readonly rows: readonly ProcessRow[];
  /**
   * The pid of the program the reader started to read the table, such as
   * `ps` or PowerShell. It's a child of the engine while it runs, so it and
   * everything below it are left out of the engine's processes.
   */
  readonly readerPid?: number;
}

/** Reads every process on the machine, once, when called. */
export type ReadProcessTable = () => Promise<ProcessTable>;

/** What a program wrote to standard output, and the pid it ran as. */
export interface ProgramOutput {
  readonly output: string;
  /** `undefined` only when the program never started, which `RunProgram` throws for. */
  readonly pid: number | undefined;
}

/**
 * Runs a program with `args`, without a shell, and gives what it wrote to
 * standard output and its pid.
 *
 * @throws Error when the program can't start, takes too long or exits with a code other than 0
 */
export type RunProgram = (program: string, args: readonly string[]) => Promise<ProgramOutput>;

/** A program's name without its folder, for a path that uses `/` or `\`. */
export function baseName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

/** `text` as a whole number 0 or more, or `undefined` when it isn't one. */
export function wholeNumber(text: string | undefined): number | undefined {
  if (text === undefined || !/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** The table read by a program that ran as `pid`, which is left out with its children. */
export function tableReadBy(rows: readonly ProcessRow[], pid: number | undefined): ProcessTable {
  return pid === undefined ? { rows } : { rows, readerPid: pid };
}
