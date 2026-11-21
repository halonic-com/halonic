# Decision: changesets ask for patch until the board approves a minor release

- Task: HAL-14730
- Approval: Liam decided this on HAL-14730 (rebase #4241 after #4242, add the patch-only check to the `changesets` rule); he reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:rIDFs3myASkpmOpaxw97SuIVFEjz8ulg4wcdwDC9I6pwg7oLid+3OBgHoSYp6qsmAyM1qz1weGMsxVffzOrWAw==

## What changes

- `tooling/check/src/rules/changesets.ts`: the `changesets` rule also fails a changeset whose step is bigger than `maxBump`, which is `patch`. The error names the file and line and says to use `patch` until a minor release is approved. Requirement `check.changesets-patch-only`.
- The five waiting changesets that said `minor` (`cli-run-json-lines`, `library-new-connector-prefill`, `proxy-from-env-in-apps`, `proxy-from-env-in-cli`, `studio-desktop-proxy`) now say `patch`. No sentence changed.

## Why

Two stray `minor` lines turned the planned Halonic 0.1.1 into 0.2.0 in the Version packages pull request. The next version is the board's decision on a release card, so a changeset may not choose it. `maxBump` is one setting: when the board approves a minor release, raising it is a one-line, reviewed change.

## Tests

No test was skipped or weakened. `changesets.test.ts` adds tests for a `minor` and a `major` changeset (each with its line) and for the message; Mateo's tests for `check.changesets-name-the-app` are unchanged.

## Covers

- tooling/check/
- check.changesets-patch-only
