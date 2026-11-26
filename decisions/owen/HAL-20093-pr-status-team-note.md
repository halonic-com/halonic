# Decision: reviewer folder limits count renamed files by their old path too

- Approval: HAL-20093 (follows halonic's `codeLines` from HAL-19283)
- Kind: internal

The reviewer-by-paths answer of `github.pull-request` changes in two ways:

1. A file renamed out of a folder with its own line limit, such as an engine's kernel, now counts
   toward that limit when its old or its new path is under the limit's `folders`. Its lines still
   count once, under its new path. Before, its old path counted 0 lines, so a rename out of the
   kernel never reached the kernel's limit. The overall line limit is unchanged.
2. The paths-only note now also says that PRs not written by the team route differently.

`runtime.github-reviewer-rules` says so, with a new example for the rename out of `src/kernel/`.
No existing test is weakened or removed; the two tests that check the note's wording now expect
the longer note.

## Why

halonic routes a file renamed out of `packages/core/engine/src/kernel/` or `packages/core/events/`
by its old path too (`codeLines`), so `pr_status` named a lower reviewer than halonic for such a
rename with 801 to 1,500 changed lines. `reviewers.yaml` can't express whether the team wrote a
pull request, so the note now says that such pull requests route differently instead of leaving the
hint silently wrong.

## Covers

- runtime.github-reviewer-rules
