# Decision: the worktree refusal without its own folder offers the clone as its own sentence

- Task: HAL-16600, with the C731 row 42 wording fix from HAL-16615 bundled in (bundling rule, HAL-14115)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16615 (words check C731 on HAL-16608, of #5288; small wording on an approved refusal, decided by the team, HAL-2282); Liam signs this note as the CTO
- Kind: user-visible

## What changes

`git.repository-refused` keeps its rule and changes only the quoted fix in its first example, the one shown when the repository's own folder isn't known. "…not a linked worktree or a submodule, or clone the repository again into a folder of its own." becomes "…not a linked worktree or a submodule. Or clone the repository again into a folder of its own." The rest of the fix stays the same.

Nothing the requirement promised before is taken away. The refusal is still `denied`, with the same message and one fix.

## Why

Words check C731 (row 42) found that "not a … or a …, or clone" makes the second "or" read as a third thing not to use. A sentence of its own makes the clone read as the other way out.

## Tests

No test was weakened or removed. The one test that quotes this fix checks the new words, with the same number of checks.

## Covers

- git.repository-refused
