/**
 * Reads the difficulty tagger's answer and turns it into label names
 * (requirement `paperclip.difficulty-tagger-labels`). The answer is model
 * text about task text anyone can write, so only the fields below, with
 * exactly these values, count; anything else is no answer.
 */

/** The kinds of work the prompt names. */
const kinds = ["code", "review", "docs", "research", "ops", "other"] as const;

/** The difficulties the prompt names, easiest first. */
const difficulties = ["D1", "D2", "D3", "D4"] as const;

/** The part of the tagger's answer the labels come from. */
export interface TaggerAnswer {
  readonly kind: (typeof kinds)[number];
  readonly difficulty: (typeof difficulties)[number];
  readonly opusOnly: boolean;
}

/** The first `{` to the last `}`, so a fenced or prefaced answer still reads. */
function jsonPart(text: string): string | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : undefined;
}

function parsed(text: string): Record<string, unknown> | undefined {
  const json = jsonPart(text);
  if (json === undefined) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    // Not JSON: the caller counts it as no answer.
    return undefined;
  }
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
  return allowed.find((item) => item === value);
}

/** The tagger's answer, or undefined when the text isn't one. */
export function readAnswer(text: string): TaggerAnswer | undefined {
  const fields = parsed(text);
  const kind = oneOf(kinds, fields?.["kind"]);
  const difficulty = oneOf(difficulties, fields?.["difficulty"]);
  const opusOnly = fields?.["opus_only"];
  if (kind === undefined || difficulty === undefined || typeof opusOnly !== "boolean") {
    return undefined;
  }
  return { kind, difficulty, opusOnly };
}

/**
 * The labels for an answer: its difficulty, plus `opus-only` when it says
 * so, for code work only. Other work gets none, so the effort table leaves
 * it at the agent's own setting.
 */
export function labelsFor(answer: TaggerAnswer): string[] {
  if (answer.kind !== "code") {
    return [];
  }
  return answer.opusOnly ? [answer.difficulty, "opus-only"] : [answer.difficulty];
}
