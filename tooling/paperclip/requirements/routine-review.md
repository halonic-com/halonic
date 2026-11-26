# paperclip.routine-review

- Status: active
- Since: unreleased
- Source: HAL-19246 (the board's decision of 26 Nov for a review-only agent, Nora; scope as the board set it on HAL-18424)

When a script routes a pull request on `halonic`, the reviewer path list shall pick the role `routine-reviewer` for it if `paperclip.reviewer-paths` names Julian for it, none of its files is in `packages/core/`, `packages/host/` or `packages/testing/spec/`, and it changes no package's public interface (a `src/index.ts`); otherwise it shall pick the role `paperclip.reviewer-paths` gives it. `routineRefusal` shall say why a pull request isn't routine, or nothing when it is.

## Examples

- Given a 40-line change to `packages/studio/features/inbox/src/view.tsx` or `tooling/paperclip/src/pr-watcher/watch.ts`,
  when it is routed,
  then its role is `routine-reviewer`.
- Given a change to `packages/core/app/src/a.ts`, `packages/host/server/src/a.ts` or `packages/studio/features/inbox/src/index.ts`,
  when it is routed,
  then its role is `second-reviewer`, and `routineRefusal` names the file.
- Given a change to an existing `packages/studio/features/inbox/package.json` that Julian may approve,
  when it is routed,
  then its role is `routine-reviewer`; a new package's `package.json` routes to `code-reviewer`, as before.
- Given 1500 changed lines in `apps/cli/src/a.ts`,
  when it is routed,
  then its role is `routine-reviewer`; with 1501 it is `code-reviewer`.
- Given a change to `.github/workflows/ci.yml` or `tooling/paperclip/src/merge-control/approval.ts`,
  when it is routed,
  then its role is `code-reviewer`.
