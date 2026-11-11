import type { ProgramProbe, ProgramProbeResult, ProgramQuestion } from "@halonicjs/ports";

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
 * line not in the table fails the test. A question about a settings folder
 * is remembered with the folder in front, as "VARIABLE=folder command line".
 */
export class FakeProbe implements ProgramProbe {
  readonly asked: string[] = [];
  readonly #answers: Readonly<Record<string, ProgramProbeResult>>;

  constructor(answers: Readonly<Record<string, ProgramProbeResult>>) {
    this.#answers = answers;
  }

  async ask(
    program: string,
    args: readonly string[],
    question: ProgramQuestion = {},
  ): Promise<ProgramProbeResult> {
    const commandLine = [program, ...args].join(" ");
    const folder = question.settingsFolder;
    this.asked.push(
      folder === undefined ? commandLine : `${folder.variable}=${folder.path} ${commandLine}`,
    );
    const answer = this.#answers[commandLine];
    if (answer === undefined) throw new Error(`The fake probe has no answer for ${commandLine}`);
    return answer;
  }
}
