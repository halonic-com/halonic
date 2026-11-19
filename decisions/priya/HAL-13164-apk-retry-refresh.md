# Decision: the debug APK retry fetches its dependencies again first

- Task: HAL-13164 (follow-up from HAL-13160)
- Approval: the task asks for this change; Liam approves this note in his review of this pull request on HAL-13164
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:9NPLZWJ/b4eV62ud60Sux2Oy48/lvr8NHHLzIc3C2bInhKvS1/HyZbdSPIfhPBOYyzN1DkZbChksSOIkwgvuCw==

## What changes

In `.github/workflows/ci.yml`, the `Build the debug APK` step of the Android shell job runs
`./gradlew --refresh-dependencies :app:dependencies --configuration universalDebugRuntimeClasspath`
in `apps/studio/src-tauri/gen/android` between attempt 1 and attempt 2. If that resolve fails, the
step writes a warning and runs attempt 2 anyway. Attempt 1 is unchanged and still uses the cache.

Triggers, rights, runners, secrets and the number of attempts don't change.

## Why

Gradle remembers a "not found" from Maven Central. When Maven Central missed a package for a moment
(run 44459992076), attempt 2 failed within a second without asking the network again, so the retry
did nothing. `tauri android build` can't pass Gradle flags through, so the refresh runs as its own
resolve before the retry.

## Tests

No test was weakened or skipped. This pull request's full run builds the debug APK with the changed
step.

## Covers

- .github/
