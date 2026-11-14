# Decision: the guard's lower expect counts on the served workspace pull request are run-to-run drift

- Task: HAL-1291
- Approval: Liam approved halonic#2769 on HAL-9704 (14 Nov); Liam signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nkVJhpLvl3jsi6GyTxpondJ/zULpMkX0TTeAmInCHVo83WsGPRs3E1dAw1DXimj2mfTolkOZBgXAgLjByCXvCw==

This pull request makes the served Studio show the workspace the computer serves, with the phone picker sheet. It changes the served Studio only: the desktop app's start, and the tests of `studio.open-folder` and `studio.settings` in `apps/studio/src/studio/start-studio.test.ts`, are unchanged.

Why the note covers two requirements: no assertion is removed. The guard counts `expect` calls at run time, and `vi.waitFor` counts every retry, so the count changes with runner speed, as on HAL-9216. On this pull request `studio.open-folder` made 29 calls against 30 on the merge base, and in earlier runs `studio.settings` made 12 against 13. The fix for that count is tracked in HAL-6453.

## Covers

- studio.open-folder
- studio.settings
