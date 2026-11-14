# Decision: the Settings test waits longer, and the guard's lower expect counts are run-to-run drift

- Task: HAL-9216
- Approval: Liam approved halonic#2643 on HAL-9216 (14 Nov), a test-only change; Liam signs this note as the CTO
- Kind: internal

`apps/studio/src/studio/start-studio.test.ts` gives each of the three waits in the test "opens Settings on Ctrl , with Appearance and a host section under On this computer" its own 8 s ceiling and gives the test a 28 s timeout. On a busy CI runner the first lazy load of the Settings dialog compiles code under coverage, so the three waits together went past the 5 s default and removed unrelated pull requests from the merge queue.

Why the note covers two requirements: no assertion is removed. The guard counts `expect` calls at run time, and `vi.waitFor` counts every retry, so the count changes with runner speed. On this pull request `studio.settings` made 12 calls against 13 on the merge base, and `studio.open-folder`, whose tests this pull request doesn't change, made 29 against 30. The fix for that count is tracked in HAL-6453.

## Covers

- studio.settings
- studio.open-folder
