/**
 * The difficulty tagger's prompt, word for word as the board ran it on the
 * backfill (HAL-16876 document `difficulty-labels`, 23 Nov). A change here
 * changes which tasks run at `high`, so it goes through the same review as
 * the effort table.
 */

/** How much of a task's description the tagger reads. */
export const descriptionLimit = 4000;

/** The instructions the model gets as its system prompt. */
export const taggerPrompt = `You route coding requests in the Halonic monorepo (TypeScript; apps/cli, apps/studio, packages/studio/features,
packages/core/*, packages/adapters/*, tooling/*, plus the website, cloud and integrations repos) to the right model.
Difficulty: D1 trivial (<=20 changed lines, 1 file, exact spec); D2 small (20-150 lines, 1-3 files, clear spec);
D3 multi-file (150-400 lines, crosses packages, some design choices); D4 hard (400+ lines, or concurrency, security, or an open spec).
opus_only is true when the change touches security, trust, sandbox, secrets, sign-in, OAuth or keychain code, anything that changes
what a run may do, or these paths: pnpm-lock.yaml, any package.json, turbo.json, biome.json, patches/, .github/, .changeset/config.json,
tooling/check/, tooling/publish/, packages/testing/parity/, infra/, apps/studio/src-tauri/, docs/security/, docs/adr/, SECURITY.md.
kind: code (changes code in a repo) | review (reviews a PR) | docs | research | ops (deploys, settings, seats, infra) | other.
specified: true when the task names the files or functions and the tests or concrete cases.
Answer with JSON only: {"kind": "...", "difficulty": "D1"|"D2"|"D3"|"D4", "opus_only": true|false, "specified": true|false,
"model": "opus"|"sonnet"|"haiku"|"deepseek", "path": "direct"|"standard"|"full"|"n/a"}
(model: opus for D4 or opus_only; sonnet for D2-D3; haiku or deepseek for D1 and light D2. path: direct for D1-D2 specified code,
standard for D2-D3, full for D4 or opus_only or an unspecified D3, n/a for non-code work.)`;

/** The text the model reads about one task: its title, then the start of its description. */
export function taggerInput(title: string, description: string | null): string {
  const start = (description ?? "").slice(0, descriptionLimit);
  return start === "" ? title : `${title}\n\n${start}`;
}
