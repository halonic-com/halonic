// Every message the checker gives, in one place, so the CLI and Studio show the same words.

/** A profile rule (HAL-17560, 1.2), `header` for the T2 header check, or `syntax` for a parse error. */
export type ProblemRule = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "header" | "syntax";

/** One reason a ToolScript fails the check, with its 1-based place in the source. */
export interface Problem {
  readonly rule: ProblemRule;
  /** Starts with the rule, such as `P4: eval is not allowed in a ToolScript`. */
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

/** The most lines in a ToolScript file (P6). */
export const maxFileLines = 300;

/** The most lines in one function (P6), the repo's own limit. */
export const maxFunctionLines = 60;

/** The highest complexity of one function (P6), the repo's own limit. */
export const maxComplexity = 15;

/** The words of each problem; the checker never writes a message anywhere else. */
export const messages = {
  notAllowed: (rule: ProblemRule, what: string) =>
    `${rule}: ${what} is not allowed in a ToolScript`,
  onlyTypeImport: () =>
    'P1: only "import type" from "@halonicjs/toolscript" is allowed in a ToolScript',
  noHeader: () => "P2: a ToolScript exports const header",
  notLiteral: (what: string) => `P2: header is a pure literal, so ${what} is not allowed in it`,
  onlyHeaderAndRun: (name: string) => `P3: a ToolScript exports only header and run, not ${name}`,
  runShape: () => "P3: run is an exported function that takes one parameter, ctx",
  fileTooLong: (lines: number) =>
    `P6: a ToolScript has at most ${maxFileLines} lines, this one has ${lines}`,
  functionTooLong: (name: string, lines: number) =>
    `P6: function ${name} has ${lines} lines, at most ${maxFunctionLines}`,
  tooComplex: (name: string, complexity: number) =>
    `P6: function ${name} has complexity ${complexity}, at most ${maxComplexity}`,
  codeTooLong: (length: number, max: number) =>
    `P6: the built code has ${length} characters, at most ${max}`,
  header: (reason: string) => `header: ${reason}`,
  syntax: (text: string) => `syntax: ${text}`,
} as const;
