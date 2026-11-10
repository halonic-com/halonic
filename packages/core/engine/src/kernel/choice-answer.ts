import type { Agent } from "@halonicjs/format";

/** An answer checked against its agent's options: the output to keep, or why it can't be kept. */
export type CheckedAnswer = { readonly output: unknown } | { readonly error: string };

/**
 * Checks an agent's answer against its options when the agent's output is a
 * `choice`: the answer, with the whitespace around it trimmed, must be one of
 * them, exactly and case-sensitively, and the output is the option itself.
 * The engine never guesses the closest option. Any other agent's answer is
 * kept as it is. A plain `task` state, a `parallel` branch and a `foreach`
 * item all check their answers here.
 */
export function checkChoiceAnswer(
  agents: Readonly<Record<string, Agent>>,
  agentId: string,
  answer: unknown,
): CheckedAnswer {
  const options = choiceOptionsOf(agents, agentId);
  if (options === null) {
    return { output: answer };
  }
  const option = optionOf(options, answer);
  return option === null
    ? { error: notAnOptionError(agentId, options, answer) }
    : { output: option };
}

/** The options of an agent whose output is a `choice`, or `null` for any other agent. */
function choiceOptionsOf(
  agents: Readonly<Record<string, Agent>>,
  agentId: string,
): readonly string[] | null {
  const output = Object.hasOwn(agents, agentId) ? agents[agentId]?.output : undefined;
  return output?.type === "choice" ? output.options : null;
}

function optionOf(options: readonly string[], answer: unknown): string | null {
  if (typeof answer !== "string") return null;
  const trimmed = answer.trim();
  return options.find((option) => option === trimmed) ?? null;
}

/** The longest part of an answer `run.failed` quotes, in characters. */
const maxQuotedAnswer = 120;

function notAnOptionError(agentId: string, options: readonly string[], answer: unknown): string {
  const text = typeof answer === "string" ? answer : (JSON.stringify(answer) ?? String(answer));
  const quoted = text.length > maxQuotedAnswer ? `${text.slice(0, maxQuotedAnswer)}…` : text;
  const listed = options.map((option) => JSON.stringify(option)).join(", ");
  return (
    `Agent "${agentId}" answered ${JSON.stringify(quoted)}, which isn't one of its options: ${listed}. ` +
    "Tighten the agent's instructions or use a larger model."
  );
}
