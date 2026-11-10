import type { ProgramProbe, ProgramProbeResult } from "@halonicjs/ports";

/** Where the fake finds `claude`. */
export const claudePath = "/usr/local/bin/claude";

/** The answer of a program that ran and ended. */
export type RanAnswer = Extract<ProgramProbeResult, { status: "ran" }>;

/** `claude` running and ending with `code`, having printed `stdout`. */
export function ran(code: number | null, stdout: string): RanAnswer {
  return { status: "ran", path: claudePath, code, stdout, stderr: "" };
}

/**
 * A {@link ProgramProbe} that answers each command line, such as
 * "claude --version", from a table, and remembers what it was asked. A command
 * line not in the table fails the test.
 */
export class FakeProbe implements ProgramProbe {
  readonly asked: string[] = [];
  readonly #answers: Readonly<Record<string, ProgramProbeResult>>;

  constructor(answers: Readonly<Record<string, ProgramProbeResult>>) {
    this.#answers = answers;
  }

  async ask(program: string, args: readonly string[]): Promise<ProgramProbeResult> {
    const commandLine = [program, ...args].join(" ");
    this.asked.push(commandLine);
    const answer = this.#answers[commandLine];
    if (answer === undefined) throw new Error(`The fake probe has no answer for ${commandLine}`);
    return answer;
  }
}
