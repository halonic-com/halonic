import type { RunFailureReason } from "@halonicjs/events";
import type { Agent } from "@halonicjs/format";

/** An agent's answer, checked against its output: the output to keep, or why it can't be kept. */
export type CheckedAnswer =
  | { readonly output: unknown }
  | { readonly error: string; readonly reason: RunFailureReason };

type AgentOutput = NonNullable<Agent["output"]>;

/**
 * Checks an agent's answer against the agent's output. When the output is a
 * `choice`, the answer, with the whitespace around it trimmed, must be one of
 * its options, exactly and case-sensitively, and the output is the option
 * itself; any other answer fails with `answer-not-an-option`. The engine
 * never guesses the closest option. When the output is `json`, a text answer
 * must be JSON, alone or inside one Markdown code fence, and the output is
 * the parsed value; any other text fails with an error that says so. The
 * engine never keeps the text in its place. Any other answer is kept as it
 * is. A plain `task` state, a `parallel` branch and a `foreach` item all
 * check their answers here.
 */
export function checkAnswer(
  agents: Readonly<Record<string, Agent>>,
  agentId: string,
  answer: unknown,
): CheckedAnswer {
  const output = outputOf(agents, agentId);
  switch (output?.type) {
    case "choice":
      return checkChoice(agentId, output.options, answer);
    case "json":
      return checkJson(agentId, answer);
    default:
      return { output: answer };
  }
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
    ? { error: notAnOptionError(agentId, options, answer), reason: "answer-not-an-option" }
    : { output: option };
}

/** One Markdown code fence around the whole answer, with an optional language tag. */
const codeFence = /^```[\w-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/;

/**
 * A harness can hand back data that is already parsed; only text is read as
 * JSON.
 */
function checkJson(agentId: string, answer: unknown): CheckedAnswer {
  if (typeof answer !== "string") {
    return { output: answer };
  }
  const trimmed = answer.trim();
  const json = codeFence.exec(trimmed)?.[1] ?? trimmed;
  try {
    return { output: JSON.parse(json) as unknown };
  } catch {
    return { error: notJsonError(agentId, answer), reason: "error" };
  }
}

/** The longest part of an answer `run.failed` quotes, in characters. */
const maxQuotedAnswer = 120;

function quoted(answer: unknown): string {
  const text = typeof answer === "string" ? answer : (JSON.stringify(answer) ?? String(answer));
  return JSON.stringify(
    text.length > maxQuotedAnswer ? `${text.slice(0, maxQuotedAnswer)}…` : text,
  );
}

function notAnOptionError(agentId: string, options: readonly string[], answer: unknown): string {
  const listed = options.map((option) => JSON.stringify(option)).join(", ");
  return (
    `Agent "${agentId}" answered ${quoted(answer)}, which isn't one of its options: ${listed}. ` +
    "Tighten the agent's instructions or use a larger model."
  );
}

function notJsonError(agentId: string, answer: string): string {
  return (
    `Agent "${agentId}" answered ${quoted(answer)}, which isn't the JSON its output asks for. ` +
    "Tighten the agent's instructions or use a larger model."
  );
}
