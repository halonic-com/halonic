# Decision: the Windows runner's temp folder is outside the profile folder

- Requirement: `profile.profile-folder` (`packages/core/profile/requirements/`), `sandbox-srt.runner-temp-folder`
- Task: HAL-10674 (closes A17)
- Approval: HAL-10674, whose description asks for the run's temp folder to move outside the profile folder on Windows; Liam reviews and signs
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:H8sFnornx+QeXJGmEbOwRMyIky8Q3rJ46xlvo7+v8VxvNILtlqs2UTWvn+uziqQ/FixC8d7fy+v71dQcErskCg==

## What changes

- `profile.profile-folder` now names the shared folder (`sharedRunnerTempFolder`, `%ProgramData%` on
  Windows) and the fallback: when the shared folder is refused or missing, the runner's temp folder stays
  in the profile folder and one line is logged.
- `packages/adapters/sandbox-srt/src/runner-temp-folder.test.ts` skips the mode-bits test on Windows.
  Windows has no POSIX mode bits, so the test can't run there. Its name carries the `[platform:win32]`
  prefix the no-skipped reporter requires. The Windows way is covered by the fence test
  `runner-temp-folder.windows.test.ts`.

## Why

The runner saw the account name in its working folder, `TEMP` and `USERPROFILE`, because its temp folder
was in the user's profile. The folder is now in the account's own private folder directly in
`%ProgramData%`, whose path holds no account name.

## Tests

No test was weakened or removed. New tests cover the folder's access list, a folder planted in advance by
another account, the fallback and its log line.

## Covers

- profile.profile-folder
- packages/adapters/sandbox-srt/src/runner-temp-folder.test.ts
