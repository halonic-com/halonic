import type { Recording } from "./recording.ts";

/** A small recording for the tests: one `echo`, on a 20 × 3 terminal. */
export function echoRecording(overrides: Partial<Recording> = {}): Recording {
  return {
    title: "Terminal · acme",
    alt: "A terminal: echo hi prints hi.",
    columns: 20,
    rows: 3,
    startDelay: 0.4,
    rest: 3,
    seed: 1,
    commands: [{ run: "echo hi", step: "1 Say", typing: 0.7, hold: 1, maxWaitForOutput: 0.3 }],
    ...overrides,
  };
}
