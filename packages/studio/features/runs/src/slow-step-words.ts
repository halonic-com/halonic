import { capitalised } from "./run-words.ts";

/** The quiet line on a step that waits longer than 10 seconds (microcopy 22 F3). */
export const slowStepWords = {
  model: (provider: string) => `Waiting for ${capitalised(provider)} to answer.`,
  tool: (tool: string) => `Waiting for the tool ${tool}.`,
  connector: (connector: string) => `Starting the connector ${connector}.`,
  harness: (program: string) => `Waiting for ${program}.`,
  sandbox: "Starting the sandbox.",
};
