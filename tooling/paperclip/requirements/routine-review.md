# paperclip.routine-review

- Status: active
- Since: unreleased
- Source: HAL-19246 (the board's decision of 26 Nov for a review-only agent, Nora; scope as the board set it on HAL-18424); HAL-19283 (Julian's findings on #6385: renamed files, public interfaces, the config and legal exclusions, and counting Nora's approvals before she takes the role; Julian's scope list on HAL-18424: the Merger's rules, plugin manifests, root and agent config, security tests, and pull requests the team didn't write); HAL-19585 and HAL-19636 (the review-verdict code and its tests); HAL-19283 and HAL-19247 (`.mcp.json` and `.claude` at any depth)

When a script routes a pull request on `halonic`, the reviewer path list shall pick the role `routine-reviewer` for it if `paperclip.reviewer-paths` names Julian for it, none of its files, by its path or a renamed file's old path, is in `packages/core/`, `packages/host/`, `packages/testing/spec/`, `tooling/config/`, `tooling/paperclip/src/merge-control/`, `tooling/paperclip/src/verdicts/` or `docs/legal/`, or starts with `tooling/paperclip/src/plugin/review-verdict-tool`, is a file at the repository root or in a root folder whose name starts with `.` other than `.changeset/`, a `.mcp.json` or a `.claude` entry or anything in a `.claude` folder in any folder, a `.gitattributes`, a `LICENSE`, `LICENCE`, `NOTICE` or `COPYING` file, or a plugin manifest (`plugin/manifest.ts`, `*plugin.json`), or names one of the code reviewer's words (`sandbox`, `secret`, `sign-in`, `oauth`, `keychain`, `trust`) outside wording files and changeset names, tests and docs included, it was written by the team (a branch `<agent>/HAL-<n>-…` in this repository, not a fork), and it changes no package's public interface (a `src/index.ts`, a `src/api.ts`, another entry point a `package.json` exports, or a package's `exports`, `main`, `module`, `types`, `typings` or `browser`); otherwise it shall pick the role `paperclip.reviewer-paths` gives it. `routineRefusal` shall say why a pull request isn't routine, or nothing when it is. Without a routing, `nora` shall cover the role. A pull request on a `changeset-release/` or `release/` branch, or with the label `area: trust and sandbox`, shall count as a security or release one, which only the code reviewer reviews.

When the Merger's gate in this repository, `pr_status` or the PR watcher reads a signed "Nora: approved on head `<sha>`", it shall count it only on the current head (after the last push, or carried over a rebase with an identical diff), only where `routineRefusal` names nothing and every changed file is known, and never on a `nora/` or `changeset-release/` branch; otherwise it shall say why it doesn't count, and the PR watcher shall hand the pull request on as it does for Julian's refused approval. A change request signed by Nora shall hold a pull request as Liam's or Julian's does.

## Examples

- Given a 40-line change to `packages/studio/features/inbox/src/view.tsx` or `tooling/paperclip/src/pr-watcher/watch.ts`,
  when it is routed,
  then its role is `routine-reviewer`, and `reviewerFor` names `nora`.
- Given a change to `packages/core/app/src/a.ts`, `packages/host/server/src/a.ts`, `packages/studio/features/inbox/src/index.ts`, `packages/studio/features/inbox/src/api.ts` or `tooling/config/biome.jsonc`,
  when it is routed,
  then its role is `second-reviewer`, and `routineRefusal` names the file.
- Given a change to the root `AGENTS.md`, `.gitattributes`, `LICENSE`, `CONTRIBUTING.md` or `docs/legal/dco-standing-statement.md`,
  when it is routed,
  then its role is `second-reviewer`; a package's own `AGENTS.md` stays routine.
- Given a change to `tooling/paperclip/src/merge-control/gate.ts`, `tooling/paperclip/src/verdicts/review-verdict.ts`, `tooling/paperclip/src/plugin/review-verdict-tool.test.ts`, `tooling/paperclip/src/plugin/manifest.ts`, `.claude/settings.json`, `.npmrc` or `packages/adapters/fs-node/src/sandbox/fence.test.ts`,
  when it is routed,
  then it isn't routine; `.changeset/inbox-label.md` and `apps/cli/src/messages/sandbox.ts` stay routine.
- Given a change to `apps/cli/.mcp.json`, `apps/cli/.claude/settings.json` or a link `apps/cli/.claude`,
  when it is routed,
  then it isn't routine; `packages/adapters/harness-claude-code/src/claude/settings.ts` and `apps/cli/src/mcp.json.ts` stay routine.
- Given a routine change from a fork or on a `dependabot/` branch,
  when it is routed,
  then `routineRefusal` says "not written by the team", and Nora's signed approval doesn't count.
- Given a pull request with the label `area: trust and sandbox`, or on a `release/` branch,
  when it is routed,
  then its role is `code-reviewer`.
- Given a pull request that renames `tooling/paperclip/src/reviewer-paths.ts` to another folder, or renames a file without naming its old path,
  when it is routed,
  then its role is `code-reviewer`; a rename out of `packages/core/` is not routine.
- Given a change to an existing `packages/studio/features/inbox/package.json` that Julian may approve,
  when it is routed,
  then its role is `routine-reviewer`, unless it changes `exports`, `main`, `module` or `types`; a new package's `package.json` routes to `code-reviewer`, as before.
- Given 1500 changed lines in `apps/cli/src/a.ts`,
  when it is routed,
  then its role is `routine-reviewer`; with 1501 it is `code-reviewer`.
- Given a change to `.github/workflows/ci.yml` or `tooling/paperclip/src/merge-control/approval.ts`,
  when it is routed,
  then its role is `code-reviewer`.
- Given "Nora: approved on head `abc1234`" on head `abc1234` of a change to `apps/cli/src/commands/run.ts`,
  when the gate or `pr_status` reads it,
  then it counts; on a change to `packages/core/app/src/a.ts` or on a `nora/` branch it doesn't.
- Given every `exports` entry of every `package.json` in the repository,
  when the check runs,
  then each is a public interface, a routine exclusion or one of Liam's paths.
