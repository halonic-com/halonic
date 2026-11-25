/**
 * The difficulty tagger's request and answer (HAL-16901): the board's tagger
 * prompt from the `difficulty-labels` document on HAL-16876, the task text it
 * reads, and the JSON it answers with. Pure, so the tests need no host.
 */

/** The model the board chose for the tagger. */
export const taggerModel = "claude-haiku-5-5";

/** The answer is one short JSON object. */
export const taggerMaxTokens = 400;

/** How much of a task's description the tagger reads. */
export const descriptionLimit = 4000;

/**
 * The board's tagger prompt, as the shadow-v1 tag analysis changed it
 * (HAL-16990, `tag-analysis` document). No tag picked the winning model there,
 * so the prompt no longer recommends a model or path; it asks only for what
 * predicts a failed first try: difficulty, opus_only, security and migration.
 */
export const taggerPrompt = `You tag coding requests in the Halonic monorepo (TypeScript; apps/cli, apps/studio, packages/studio/features,
packages/core/*, packages/adapters/*, tooling/*, plus the website, cloud and integrations repos) by difficulty and risk.
Difficulty: D1 trivial (<=20 changed lines, 1 file, exact spec); D2 small (20-150 lines, 1-3 files, clear spec);
D3 multi-file (150-400 lines, crosses packages, some design choices); D4 hard (400+ lines, or concurrency, security, or an open spec).
opus_only is true when the change touches security, trust, sandbox, secrets, sign-in, OAuth or keychain code, anything that changes
what a run may do, or these paths: pnpm-lock.yaml, any package.json, turbo.json, biome.json, patches/, .github/, .changeset/config.json,
tooling/check/, tooling/publish/, packages/testing/parity/, infra/, apps/studio/src-tauri/, docs/security/, docs/adr/, SECURITY.md.
kind: code (changes code in a repo) | review (reviews a PR) | docs | research | ops (deploys, settings, seats, infra) | other.
security: true when the change touches security, trust, sandbox, secrets, sign-in, OAuth or keychain code.
migration: true when the change alters stored formats, schemas or file versions, or renames something old workspaces must survive.
specified: true when the task names the files or functions and the tests or concrete cases.
A fix and a bugfix are the same kind of work: code.
Answer with JSON only: {"kind": "...", "difficulty": "D1"|"D2"|"D3"|"D4", "opus_only": true|false, "security": true|false,
"migration": true|false, "specified": true|false}`;

/** What the tagger reads of a task: its title and the start of its description. */
export function taggerInput(title: string, description: string | null): string {
  const start = (description ?? "").slice(0, descriptionLimit);
  return `Title: ${title}\n\nDescription:\n${start}`;
}

/**
 * The Messages API request body. The answer is a lookup, not a plan, so it asks
 * for low effort: Haiku 5.5 sets its thinking through effort, not a `thinking` switch.
 */
export function taggerRequest(input: string): Record<string, unknown> {
  return {
    model: taggerModel,
    max_tokens: taggerMaxTokens,
    output_config: { effort: "low" },
    system: taggerPrompt,
    messages: [{ role: "user", content: input }],
  };
}

/** The kinds of work the prompt names. Only `code` gets labels. */
const kinds = ["code", "review", "docs", "research", "ops", "other"] as const;

/** A difficulty the prompt allows. */
export type DifficultyLabel = "D1" | "D2" | "D3" | "D4";

/** The part of the tagger's answer the labels come from. */
export interface TaggerAnswer {
  readonly kind: (typeof kinds)[number];
  /** Required for code; work that isn't code gets no labels, so it may leave it out. */
  readonly difficulty: DifficultyLabel | undefined;
  readonly opusOnly: boolean;
}

function difficultyLabel(value: unknown): DifficultyLabel | undefined {
  return value === "D1" || value === "D2" || value === "D3" || value === "D4" ? value : undefined;
}

/**
 * Reads the JSON object in the model's text, or undefined when it isn't one
 * the prompt allows. The task text is anyone's writing, so the answer is
 * checked field by field rather than trusted.
 */
export function parseTaggerAnswer(text: string): TaggerAnswer | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    return undefined;
  }
  let answer: { kind?: unknown; difficulty?: unknown; opus_only?: unknown };
  try {
    answer = JSON.parse(text.slice(start, end + 1)) as typeof answer;
  } catch {
    return undefined;
  }
  const kind = kinds.find((known) => known === answer.kind);
  const difficulty = difficultyLabel(answer.difficulty);
  if (kind === undefined || typeof answer.opus_only !== "boolean") {
    return undefined;
  }
  if (kind === "code" && difficulty === undefined) {
    return undefined;
  }
  return { kind, difficulty, opusOnly: answer.opus_only };
}
