# Decision: the weekly reminder names the sign-in step, not "step 7"

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18826 (team fix of a wrong step number; the behaviour Liam approved on HAL-18664 doesn't change)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:qcrm5jAdY4G6BgaaWf1DaNnyqTMiqKhMbGpu/lz+TREmjUwx4NFL2qRetICf6bzMK8niviJKcwkMV7a6xVwzAQ==

`google-setup.weekly-reminder` said "step 7", but a personal app in *Testing* has six steps by
default: the Scopes step is left out (`google-setup.scopes-switch`), so signing in is step 6. Its
own test already checks "Step 6 of 6". The requirement now names the sign-in step (the last one)
instead of a number, which stays right when `listScopes: true` brings the Scopes step back.
Nothing a user sees changes, and no test is weakened.

## Covers

- google-setup.weekly-reminder
