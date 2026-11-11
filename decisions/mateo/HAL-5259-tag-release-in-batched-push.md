# Decision: the release bot looks at every commit of a push

- Task: HAL-5259 (the merge queue pushed the 0.1.0 release pull request together with another one, and the bot tagged nothing; HAL-4824)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-5259](/HAL/issues/HAL-5259)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2b9nKnl++2O4R0A+GOVaPtviA86cAKOFB8Qu3YBUEMEfcDlCdLCeufL02GfFE0HgChpPpzSR7uc73yzHyUH7DA==

## What changes

`.github/workflows/version-packages.yml` no longer asks GitHub about the last commit of a push only. A new step runs `tooling/publish/src/cli/find-release-commit.ts`, which lists `before..sha`, reads the app version at each commit and looks for a pull request titled `chore(release): Halonic <version>` (a task suffix such as `(HAL-4824)` is allowed). It tags that commit, not `github.sha`, and runs `pnpm check versions` at that commit. The guards stay: tag only on push, skip when the tag exists, warn and tag nothing when the lookup fails.

## Why

With the merge queue, one push can hold several merged pull requests, so the release pull request is not always the last commit.

## Tests

No test was weakened or skipped. `release-commit.test.ts` covers a batched push, an ordinary push, a title and version that disagree, a task suffix and the commit range. A dry run of the script on the real push (`699c83b` and `11a0e48`) finds `699c83b` and 0.1.0.

## Covers

- .github/
