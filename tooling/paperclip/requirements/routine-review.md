# paperclip.routine-review

- Status: active
- Since: unreleased
- Source: HAL-19246 (the board's decision of 26 Nov for a review-only agent, Nora; scope set by Liam)

When a script routes a pull request on `halonic`, the reviewer path list shall pick the role `routine-reviewer` for it if `paperclip.reviewer-paths` names Julian for it, none of its files is in `packages/core/`, `packages/host/`, `packages/testing/spec/` or `tooling/paperclip/`, it changes no package's public interface (a `src/index.ts`) and no `package.json`, and it changes at most 800 lines, counting neither tests, Markdown nor wording files and counting every line of the pull request when it doesn't know a file's lines; otherwise it shall pick the role `paperclip.reviewer-paths` gives it. `routineRefusal` shall say why a pull request isn't routine, or nothing when it is.

## Examples

- Given a 40-line change to `packages/studio/features/inbox/src/view.tsx`,
  when it is routed,
  then its role is `routine-reviewer`.
- Given a change to `packages/core/app/src/a.ts`, `packages/host/server/src/a.ts` or `packages/studio/features/inbox/src/index.ts`,
  when it is routed,
  then its role is `second-reviewer`, and `routineRefusal` names the file.
- Given a change to `packages/studio/features/inbox/package.json`,
  when it is routed,
  then its role is `second-reviewer`, since a manifest can add a package or a dependency.
- Given 801 changed lines in `apps/cli/src/a.ts`,
  when it is routed,
  then its role is `second-reviewer`; with 800 lines of code and 900 lines of tests, it is `routine-reviewer`.
- Given a change to `.github/workflows/ci.yml`,
  when it is routed,
  then its role is `code-reviewer`, as before.
