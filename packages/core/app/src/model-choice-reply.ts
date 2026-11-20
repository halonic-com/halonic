// The one tiny call that tests a model choice before it is saved, and what
// its answer or its error means for the model screen (first-run-flow 3.3,
// the error table). The call itself goes through the model adapter a run
// uses; this file only builds the request and reads what came back.

import { type ChatRequest, type ChatResponse, isModelCallError } from "@halonicjs/ports";
import { choiceModel, type ModelChoice } from "./model-choice.ts";

/** The labels the test asks the model to pick from, as Acme's Sorter does. */
export const testReplyOptions = ["refund", "question", "spam"] as const;

// A copy of Acme's Sorter (examples/acme/hubs/support/agents/sorter.agent.yaml)
// and the prompt the engine builds for it, so the test asks for the reply the
// workflow's first choice step needs: a model that can't give it here can't
// run the demo either.
const sorterSystemPrompt = [
  "Read the customer's email and answer with one word:",
  "refund when they want money back,",
  "question when they ask something else,",
  "spam when nobody needs to answer it.",
  "",
  `Reply with exactly one of: ${testReplyOptions.join(", ")}. No other words.`,
].join("\n");

const testEmail = [
  "Hi, my order #1042 arrived damaged.",
  "Can I get a refund? — Sam (invented)",
].join("\n");

/**
 * The test call for a choice: one Sorter-shaped request on its model. It
 * offers no tools and sets no sampling, so it is the call a run's first
 * step makes. The caller adds the time limit through `signal`
 * ({@link testTimeLimitMs}).
 */
export function modelTestRequest(choice: ModelChoice, signal?: AbortSignal): ChatRequest {
  const request: ChatRequest = {
    model: choiceModel(choice),
    messages: [
      { role: "system", content: sorterSystemPrompt },
      { role: "user", content: `## Data\n\n### input.mail\n${testEmail}` },
    ],
    meta: { agentId: "sorter" },
  };
  return signal === undefined ? request : { ...request, signal };
}

/**
 * Whether the model's answer is one the workflow can use: exactly one of
 * {@link testReplyOptions}, with only whitespace around it, as the engine
 * checks a `choice` output. It asks for the form, not the right label.
 */
export function readTestReply(reply: ChatResponse): "usable" | "not-usable" {
  if (reply.toolCalls.length > 0) return "not-usable";
  const answer = reply.content.trim();
  return testReplyOptions.some((option) => option === answer) ? "usable" : "not-usable";
}

/**
 * What the test found, one row of the model screen's error table:
 * - `ok`: the model answered; the choice can be saved.
 * - `key-refused`: the provider didn't accept the key.
 * - `no-credit`: the key works, but the account has no credit or is over its limit.
 * - `offline`: the provider couldn't be reached.
 * - `provider-error`: the provider was reached but didn't answer in time, or failed.
 * - `local-not-answering`: the local model didn't answer, or gave up loading.
 * - `local-not-usable`: the local model answered, but not in a form the workflow can use.
 */
export type TestOutcome =
  | "ok"
  | "key-refused"
  | "no-credit"
  | "offline"
  | "provider-error"
  | "local-not-answering"
  | "local-not-usable";

/** What came back from the test call: the model's answer, or the error the call threw. */
export type TestResult = { readonly reply: ChatResponse } | { readonly error: unknown };

/**
 * The outcome of a choice's test call. A key's answer passes whatever its
 * form: the key and the account are what is tested, and the model is the
 * one Studio picked. A local model's answer must be usable
 * ({@link readTestReply}). Any error from a local model, such as the time
 * limit's abort, is `local-not-answering`; for a key, an error that isn't a
 * known {@link ModelCallError} reason is `provider-error`.
 *
 * @example
 * testOutcome({ kind: "key", provider: "anthropic" }, { error: new ModelCallError("out-of-credit", "…") });
 * // "no-credit"
 */
export function testOutcome(choice: ModelChoice, result: TestResult): TestOutcome {
  if (choice.kind === "local") {
    if ("error" in result) return "local-not-answering";
    return readTestReply(result.reply) === "usable" ? "ok" : "local-not-usable";
  }
  if ("reply" in result) return "ok";
  return keyErrorOutcome(result.error);
}

function keyErrorOutcome(error: unknown): TestOutcome {
  if (!isModelCallError(error)) return "provider-error";
  switch (error.reason) {
    case "no-key":
    case "key-refused":
      return "key-refused";
    case "out-of-credit":
      return "no-credit";
    case "offline":
      return "offline";
    default:
      return "provider-error";
  }
}
