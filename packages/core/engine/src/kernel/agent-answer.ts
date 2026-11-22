import {
  answerNotAnOptionCause,
  type RejectedAnswer,
  type RunFailureCause,
  type RunFailureReason,
} from "@halonicjs/events";
import type { Agent, AgentOutput } from "@halonicjs/format";

/**
 * An agent's answer, checked against its output: the output to keep, or why it can't be kept.
 * An answer that isn't one of the choices also has the typed cause with the agent and the choices.
 */
export type CheckedAnswer =
  | { readonly output: unknown }
  | {
      readonly error: string;
      readonly reason: RunFailureReason;
      readonly cause?: RunFailureCause;
      /** With `optIn`: the answer in full, and what the JSON parser said. */
      readonly rejected?: RejectedAnswer;
    };

/**
 * Checks an agent's answer against the agent's output. When the output is a
 * `choice`, the answer, with the whitespace around it trimmed, must be one of
 * its options, exactly and case-sensitively, and the output is the option
 * itself; any other answer fails with `answer-not-an-option`, and with a
 * cause that names the agent and the choices but not the answer
 * (`events.answer-choices`). The engine never guesses the closest option. When the output is `json`, a text answer
 * must be JSON, alone or inside one Markdown code fence, and the output is
 * the parsed value; any other text fails with an error that says so. The
 * engine never keeps the text in its place. Any other answer is kept as it
 * is. A plain `task` state, a `parallel` branch and a `foreach` item all
 * check their answers here. A step's own output, from its `format` or the
 * method it calls (`stepOutputOf`), takes the place of the agent's. With
 * `optIn`, for an agent whose `answerRetries` opts in, no answer at all to a
 * `json` output is refused as well, as an empty text is; a text that isn't
 * JSON as a whole is searched for the JSON in it (`foundJson`); and a refusal
 * carries the answer in full in `rejected`.
 */
export function checkAnswer(
  agents: Readonly<Record<string, Agent>>,
  agentId: string,
  answer: unknown,
  stepOutput?: AgentOutput,
  optIn = false,
): CheckedAnswer {
  const output = stepOutput ?? outputOf(agents, agentId);
  const checked = checkOutput(agentId, output, answer, optIn);
  if (!optIn || !("error" in checked)) {
    return checked;
  }
  return { ...checked, rejected: { answer: answerText(answer), ...checked.rejected } };
}

function checkOutput(
  agentId: string,
  output: AgentOutput | undefined,
  answer: unknown,
  optIn: boolean,
): CheckedAnswer {
  switch (output?.type) {
    case "choice":
      return checkChoice(agentId, output.options, answer);
    case "json":
      return optIn && (answer === null || answer === undefined)
        ? notJson(agentId, "")
        : checkJson(agentId, answer, optIn);
    default:
      return { output: answer };
  }
}

/** The answer as text, for the log: empty when there was none. */
function answerText(answer: unknown): string {
  if (answer === null || answer === undefined) {
    return "";
  }
  return typeof answer === "string" ? answer : (JSON.stringify(answer) ?? String(answer));
}

function outputOf(
  agents: Readonly<Record<string, Agent>>,
  agentId: string,
): AgentOutput | undefined {
  return Object.hasOwn(agents, agentId) ? agents[agentId]?.output : undefined;
}

function checkChoice(agentId: string, options: readonly string[], answer: unknown): CheckedAnswer {
  const trimmed = typeof answer === "string" ? answer.trim() : null;
  const option = options.find((candidate) => candidate === trimmed);
  return option === undefined
    ? {
        error: notAnOptionError(agentId, options, answer),
        reason: "answer-not-an-option",
        cause: answerNotAnOptionCause({ agent: agentId, options }),
      }
    : { output: option };
}

/** One Markdown code fence around the whole answer, with an optional language tag. */
const codeFence = /^```[\w-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/;

/**
 * A harness can hand back data that is already parsed; only text is read as
 * JSON. With `optIn`, a text that isn't JSON as a whole gets a second look
 * for the JSON in it, and a refusal says what the parser said.
 */
function checkJson(agentId: string, answer: unknown, optIn: boolean): CheckedAnswer {
  if (typeof answer !== "string") {
    return { output: answer };
  }
  const trimmed = answer.trim();
  const whole = parseJson(codeFence.exec(trimmed)?.[1] ?? trimmed);
  if ("value" in whole) {
    return { output: whole.value };
  }
  if (!optIn) {
    return notJson(agentId, answer);
  }
  const found = foundJson(trimmed);
  const parsed = found === undefined ? whole : parseJson(found);
  return "value" in parsed
    ? { output: parsed.value }
    : { ...notJson(agentId, answer), rejected: { answer, parseError: parsed.parseError } };
}

function parseJson(text: string): { readonly value: unknown } | { readonly parseError: string } {
  try {
    return { value: JSON.parse(text) as unknown };
  } catch (error) {
    return { parseError: error instanceof Error ? error.message : String(error) };
  }
}

/** Every Markdown code fence in an answer: its language tag and its text. */
const anyCodeFence = /```([\w-]*)[ \t]*\r?\n([\s\S]*?)\r?\n?```/g;

/**
 * The JSON in an answer with text around it: its one `json` (or untagged)
 * code fence, or else its one complete top-level `{…}` object. With none, or
 * more than one, there is nothing to take: the engine doesn't pick.
 */
function foundJson(text: string): string | undefined {
  const fences = [...text.matchAll(anyCodeFence)]
    .filter(([, tag]) => tag === "" || tag?.toLowerCase() === "json")
    .map(([, , body]) => body ?? "");
  const candidates = fences.length > 0 ? fences : topLevelObjects(text);
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Each balanced `{…}` outside any other, skipping braces inside its JSON strings. */
function topLevelObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (char === '"' && depth > 0) {
      at = stringEnd(text, at);
    } else if (char === "{") {
      start = depth === 0 ? at : start;
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        objects.push(text.slice(start, at + 1));
      }
    }
  }
  return objects;
}

/** Where the JSON string that opens at `open` closes, past its escapes; the text's end when it doesn't. */
function stringEnd(text: string, open: number): number {
  for (let at = open + 1; at < text.length; at += 1) {
    if (text[at] === "\\") {
      at += 1;
    } else if (text[at] === '"') {
      return at;
    }
  }
  return text.length;
}

/** The error already says the fix, so a host knows the cause (HAL-14301). */
function notJson(agentId: string, answer: string): Extract<CheckedAnswer, { error: string }> {
  return {
    error: notJsonError(agentId, answer),
    reason: "error",
    cause: { kind: "invalid_input", code: "answer.not-json", detail: { agent: agentId } },
  };
}

/** What every unusable answer's error ends with: advice for the person, not the agent. */
const advice = "Tighten the agent's instructions or use a larger model.";

/**
 * The prompt that asks an agent again after an unusable answer: the step's
 * prompt, then the answer's error without the advice meant for a person, and
 * what the JSON parser said, when it said something.
 */
export function answerAgainPrompt(prompt: string, error: string, parseError?: string): string {
  const problem = error.endsWith(advice) ? error.slice(0, -advice.length).trim() : error;
  const parser = parseError === undefined ? "" : ` The JSON parser said: ${parseError}`;
  return `${prompt}\n\nYour answer can't be used: ${problem}${parser} Answer again with only what your output asks for.`;
}

/** The longest part of an answer `run.failed` quotes, in characters. */
const maxQuotedAnswer = 120;

function quoted(answer: unknown): string {
  const text = typeof answer === "string" ? answer : (JSON.stringify(answer) ?? String(answer));
  return JSON.stringify(
    text.length > maxQuotedAnswer ? `${text.slice(0, maxQuotedAnswer)}…` : text,
  );
}

/** "The agent sorter answered "questions", which isn't one of its options (refund, question, spam). …" (C337 C17). */
function notAnOptionError(agentId: string, options: readonly string[], answer: unknown): string {
  return (
    `The agent ${agentId} answered ${quoted(answer)}, which isn't one of its options (${options.join(", ")}). ` +
    advice
  );
}

function notJsonError(agentId: string, answer: string): string {
  return (
    `Agent "${agentId}" answered ${quoted(answer)}, which isn't the JSON its output asks for. ` +
    advice
  );
}
