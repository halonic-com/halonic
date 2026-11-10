/** Why `decide` refused an input. Nothing is recorded for a refused input. */
export type RefusalCode =
  | "engine.run-exists"
  | "engine.run-unknown"
  | "engine.run-ended"
  | "engine.input-not-accepted"
  | "engine.decision-callid-must-match";

/**
 * An input `decide` refuses. `step` reports it to the caller and appends
 * nothing. It has a file of its own so state handlers can refuse too
 * without importing `decide`, which imports them.
 */
export class InputRefused extends Error {
  readonly code: RefusalCode;

  constructor(code: RefusalCode, message: string) {
    super(message);
    this.name = "InputRefused";
    this.code = code;
  }
}
