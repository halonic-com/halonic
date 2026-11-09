import type { ProcessRow } from "./process-tree.ts";

/** Reads every process on the machine, once, when called. */
export type ReadProcessTable = () => Promise<readonly ProcessRow[]>;

/**
 * Runs a program with `args`, without a shell, and gives what it wrote to
 * standard output.
 *
 * @throws Error when the program can't start, takes too long or exits with a code other than 0
 */
export type RunProgram = (program: string, args: readonly string[]) => Promise<string>;

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
