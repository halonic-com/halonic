# Decision: the Android Gradle cache is saved only after a good build

- Task: HAL-13594
- Approval: the task asks for this change (HAL-13594); Liam approves and signs this note in review
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, job Android shell (debug APK):

- The Gradle cache is saved only after a good build (`success()` instead of `always()`). It is
  still saved only on `main` and not on an exact key hit.

The key is unchanged: #3859 (HAL-13164) already added `apps/studio/src-tauri/Cargo.lock` to it, so
a Tauri plugin that brings Gradle dependencies (the barcode scanner brings CameraX) gives a new key.
This PR first carried its own key change for the same problem; that part was dropped when it was
rebased onto #3859.

Triggers, rights, runners, secrets and the Gradle settings in `gen/android` don't change.

## Why

`main` went red at 12:05 on 19 Nov: Maven Central answered 404 for
`com.google.auto.value:auto-value-annotations:1.6.3`, which CameraX needs. A failed build can
leave Gradle's record of a 404, which it trusts for 24 hours; saved into the cache, that record
would fail every run that restores it.

## Tests

Workflow only: no unit test applies. The PR run must pass the Android job.

## Covers

- .github/
