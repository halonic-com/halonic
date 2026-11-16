import { type EngineWords, errorMessageFor } from "@halonicjs/studio-shell";

/**
 * The line under the request form when a request didn't start (microcopy 10.3): "Not started:
 * *reason*." The reason is the failure's own sentence, in lower case after the colon. A failure
 * with no kind of its own says the engine isn't answering, since it never reached the engine.
 */
export function notStartedLine(error: unknown, words: EngineWords): string {
  const message = errorMessageFor(error, { title: "Not started" });
  const reason = message.kind === "internal" ? words.notAnswering : message.body;
  const trimmed = reason.trim().replace(/\.$/, "");
  return `Not started: ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}.`;
}
