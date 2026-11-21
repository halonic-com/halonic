# Decision: a pull request leaves 20 lines of room under the file-size limit

- Task: HAL-15461
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15461 (board decision, Timothy, 21 Nov)
- Kind: internal

## What changes

On a pull request, the `file-size` rule also fails a file the change grows to more than 480
lines, 20 under the limit of 500 (`prHeadroomLines` in
`tooling/check/src/rules/file-size.ts`). CI compares
each file with the main commit the merge ref is built on (`SIZE_BASE`, set only for
`pull_request` runs); a local `pnpm check` compares with `origin/main`. A file the pull request
doesn't grow passes, so a small fix never forces a split. The merge queue and `main` keep the
plain 500-line limit, so nothing already on `main` turns red.

Nothing existing is removed or weakened; tests are added for the new check.

## Why

Merge group 44956650004 failed because two pull requests that each passed their own CI together
took `packages/studio/features/agents/src/api.ts` to 513 lines, and the 7 groups behind it were
cancelled and rerun. The room under the limit stops the second pull request in its own CI. It
doesn't change what a run may do.

## Covers

- .github/
- tooling/check/
