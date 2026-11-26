# Decision: pr_status asks each repository only for the workflows it requires

- Task: HAL-19392
- Approval: HAL-19392 asked for this fix (Tomas, with Mateo as the merge-queue fallback); Julian reviews it and signs this note
- Kind: internal

## What changes

- `tooling/paperclip/src/pr-tools/required-workflows.ts` and `tooling/paperclip/src/merge-control/checks.ts`: the required workflows besides CI are listed per repository. `halonic-com/halonic` still needs Guard notes and Built-on label; `halonic-com/cloud` needs only Built-on label. Requirement `paperclip.pr-tools-required-workflows`.
- The requirement note says which workflows each repository requires.

## Why

cloud has no Guard notes workflow, and its ruleset on `main` requires only `ci-ok` and `built-on-label`. `pr_status` still listed "Guard notes has not run" for every open cloud PR, so cloud#185 looked as if it waited on a check that can never run.

## Tests

No test was skipped or weakened. `required-workflows.test.ts` adds a cloud PR shaped like cloud#185 that lists no Guard notes; the halonic cases are unchanged.

## Covers

- tooling/paperclip/
- paperclip.pr-tools-required-workflows
