// Helpers for the kind tests: parse a YAML text and get the value or the
// problems, with a clear failure when the other one comes back.
import { expect } from "vitest";
import { type FileProblem, type KindName, type KindValues, parseFile } from "../index.ts";

/** Lines joined with "\n", so a test can write a YAML file as a list of lines. */
export function yaml(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

/** Parses a file that must pass, and returns its value. */
export function parsedValue<Name extends KindName>(
  kind: Name,
  text: string,
  id?: string,
): KindValues[Name] {
  const parsed = parseFile(kind, text, id === undefined ? {} : { id });
  if (!parsed.ok) {
    expect.fail(`expected ${kind} to pass, got ${JSON.stringify(parsed.error)}`);
  }
  return parsed.value.value;
}

/** Parses a file that must fail, and returns its problems. */
export function problemsOf(kind: KindName, text: string, id?: string): FileProblem[] {
  const parsed = parseFile(kind, text, id === undefined ? {} : { id });
  if (parsed.ok) {
    expect.fail(`expected ${kind} to fail, got ${JSON.stringify(parsed.value)}`);
  }
  return parsed.error;
}

/** Each problem as "path code line", for compact expectations. */
export function summary(problems: readonly FileProblem[]): string[] {
  return problems.map((problem) => `${problem.path.join(".")} ${problem.code} ${problem.line}`);
}
