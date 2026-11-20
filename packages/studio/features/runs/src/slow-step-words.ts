import { providerName } from "./failure-words.ts";

/**
 * What a step that waits says (microcopy 22 F3, first-run-progress section 9): it names the thing,
 * never "Please wait". The time and the dot are the WaitingLine's.
 */
export const slowStepWords = {
  model: (provider: string) => `Waiting for ${providerName(provider)}`,
  /**
   * Ollama runs the model on this computer, the one wait whose reason Studio knows. A cloud
   * provider gets no reason: Studio doesn't know why it's slow.
   */
  ollama: "Waiting for Ollama on this computer",
  /** On a phone, Ollama runs on the computer: the line says so (microcopy 5). */
  ollamaOnPhone: "Waiting for Ollama on your computer",
  ollamaReason: "It loads the model first, so the start is slow.",
  tool: (tool: string) => `Waiting for the tool ${tool}`,
  connector: (connector: string) => `Starting the connector ${connector}`,
  harness: (program: string) => `Waiting for ${program}`,
  sandbox: "Starting the sandbox",
  /** The way out after 10 seconds, once Check this computer can open (HAL-13411). */
  somethingWrong: "Something wrong?",
};
