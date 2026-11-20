# Decision: the Gradle cache key includes Cargo.lock

- Task: HAL-13164 (follow-up from HAL-13160)
- Approval: the task asks for this change; Liam approves this note in his review of this pull request on HAL-13164
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Orqti8BAbgdBFIMVPQqYRMsSuSgnuN9R8oWhZZTPjA8uFvEvRiKAvHWT9aTzOemtCHJ1XQdJAmAHggmm8FfIDQ==

## What changes

In `.github/workflows/ci.yml`, the key of the Android shell job's Gradle cache also hashes
`apps/studio/src-tauri/Cargo.lock`. The build step and its retry stay as they are on `main`.

Triggers, rights, runners, secrets and the number of attempts don't change.

## Why

The task first asked for a dependency refresh before the retry. That version ran for real in run
44482968653 and made things worse: Maven Central was still answering "not found" a minute later, and
the refresh re-checked every dependency, including the Kotlin build-script packages that were fine in
the cache. Attempt 2 then failed on those as well.

The real cause is the cache key. It only hashed the generated Gradle files, which last changed on
9 Nov. The barcode-scanner plugin (18 Nov) brings `androidx.camera` and `auto-value-annotations`
through Cargo, not through those files. So every run got an exact hit on a cache without them,
downloaded them from Maven Central, and saved nothing. Every Android build depended on Maven Central
answering, which is why `auto-value-annotations:1.6.3` kept missing.

With `Cargo.lock` in the key, a plugin change gives a new key. The next `main` run restores the old
cache through `restore-keys`, downloads the new packages once and saves a complete cache.

## Tests

No test was weakened or skipped. This pull request's full run builds the debug APK. The cache saves
only on `main`, so the fix takes effect from the first `main` run after the merge.

## Covers

- .github/
