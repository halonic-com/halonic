/**
 * The difficulty tagger's question to Haiku and how its answer becomes task
 * labels (HAL-16928, requirement `paperclip.task-tagger`). The prompt is the
 * board's, word for word, from the `difficulty-labels` document on HAL-16876.
 */

/** The model the board chose for tagging: cheap, about 0.7 s a task. */
export const taggerModel = "claude-haiku-5-5";

/** Enough for the one-line JSON answer. */
export const taggerMaxTokens = 400;

/** How much of a task's description the tagger reads. */
export const descriptionLimit = 4000;

/** The board's tagger prompt (HAL-16876, `difficulty-labels`). */
export const taggerPrompt = [
  "You route coding requests in the Halonic monorepo (TypeScript; apps/cli, apps/studio, packages/studio/features,",
  "packages/core/*, packages/adapters/*, tooling/*, plus the website, cloud and integrations repos) to the right model.",
  "Difficulty: D1 trivial (<=20 changed lines, 1 file, exact spec); D2 small (20-150 lines, 1-3 files, clear spec);",
  "D3 multi-file (150-400 lines, crosses packages, some design choices); D4 hard (400+ lines, or concurrency, security, or an open spec).",
  "opus_only is true when the change touches security, trust, sandbox, secrets, sign-in, OAuth or keychain code, anything that changes",
  "what a run may do, or these paths: pnpm-lock.yaml, any package.json, turbo.json, biome.json, patches/, .github/, .changeset/config.json,",
  "tooling/check/, tooling/publish/, packages/testing/parity/, infra/, apps/studio/src-tauri/, docs/security/, docs/adr/, SECURITY.md.",
  "kind: code (changes code in a repo) | review (reviews a PR) | docs | research | ops (deploys, settings, seats, infra) | other.",
  "specified: true when the task names the files or functions and the tests or concrete cases.",
  'Answer with JSON only: {"kind": "...", "difficulty": "D1"|"D2"|"D3"|"D4", "opus_only": true|false, "specified": true|false,',
  '"model": "opus"|"sonnet"|"haiku"|"deepseek", "path": "direct"|"standard"|"full"|"n/a"}',
  "(model: opus for D4 or opus_only; sonnet for D2-D3; haiku or deepseek for D1 and light D2. path: direct for D1-D2 specified code,",
  "standard for D2-D3, full for D4 or opus_only or an unspecified D3, n/a for non-code work.)",
].join("\n");

/** The labels the tagger writes and reads as "already tagged". */
export const difficultyLabels = ["D1", "D2", "D3", "D4"] as const;

/** A difficulty label. */
export type DifficultyLabel = (typeof difficultyLabels)[number];

/** The risk label. */
export const opusOnlyLabel = "opus-only";

/** The kinds of work the prompt names. */
const kinds = ["code", "review", "docs", "research", "ops", "other"] as const;

/** What the tagger takes from Haiku's answer; the rest of the JSON is advice it doesn't act on. */
export interface Verdict {
  readonly kind: (typeof kinds)[number];
  readonly difficulty: DifficultyLabel;
  readonly opusOnly: boolean;
}

/** The user message: the task's title and the start of its description. */
export function taskMessage(title: string, description: string | null): string {
  const text = (description ?? "").slice(0, descriptionLimit);
  return `Title: ${title}\n\nDescription:\n${text}`;
}

/** The first `{…}` in the answer, so a stray sentence or code fence around it doesn't matter. */
function jsonObject(answer: string): unknown {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end < start) {
    return undefined;
  }
  try {
    return JSON.parse(answer.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/**
 * Reads Haiku's answer, or undefined when it isn't the JSON the prompt asks
 * for. Only the three fields the labels need are checked; the task text is
 * anyone's, so nothing else in the answer is trusted.
 */
export function parseVerdict(answer: string): Verdict | undefined {
  const value = jsonObject(answer) as
    | { kind?: unknown; difficulty?: unknown; opus_only?: unknown }
    | undefined;
  const kind = kinds.find((known) => known === value?.kind);
  const difficulty = difficultyLabels.find((label) => label === value?.difficulty);
  if (kind === undefined || difficulty === undefined || typeof value?.opus_only !== "boolean") {
    return undefined;
  }
  return { kind, difficulty, opusOnly: value.opus_only };
}

/** The labels for a verdict: a difficulty and maybe `opus-only` for code, none for other work. */
export function labelsFor(verdict: Verdict): readonly string[] {
  if (verdict.kind !== "code") {
    return [];
  }
  return verdict.opusOnly ? [verdict.difficulty, opusOnlyLabel] : [verdict.difficulty];
}

/** Whether a label is one the tagger writes; `D5` counts too, as the effort table reads it. */
export function isTaggerLabel(name: string): boolean {
  const label = name.trim().toLowerCase();
  return /^d[1-5]$/.test(label) || label === opusOnlyLabel;
}
