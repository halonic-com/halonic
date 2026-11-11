# Decision: git.path-batches names the calls part 2 split

- Approval: [HAL-4785](/HAL/issues/HAL-4785), where the maintainer asked for this list to be extended in review of halonic#1538
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:T13jJkqR2290q7qexh5hTH6jdOrOFUHbYV9dnHrOZYUJc0toTMo1YWEwjsFlmeKjMMr6l9KUMgcT3qtVG0aEAw==

## What changes

`git.path-batches` already says the git Vcs keeps every git call under Windows' command-line
limit. Its "This covers" list named only the calls split in part 1 (halonic#1414): `stage`,
`unstage`, `discard` and taking private files out of a snapshot. Part 2 (halonic#1538) split the
path lists in making a version, making a proposal and checking out a worktree, and tested them
under this requirement. The list now names those too, and three examples describe what the tests
check.

## Why

The requirement should say what it covers, so a reader doesn't have to find the tests to learn it.
The promise itself is unchanged and no test changes; nothing that worked before stops working.

## Covers

- git.path-batches
