# Decision: the Android build retry clears the Gradle configuration cache

- Approval: the task HAL-13669 (a follow-up from the nightly failure on HAL-13664); Liam approves this note in review on HAL-13669 and signs it
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the `Build the debug APK` step of the `Android shell (debug APK)`
job still makes at most 2 attempts. Between them it now stops the Gradle daemon
(`./gradlew --stop`) and deletes `src-tauri/gen/android/.gradle/configuration-cache`, so the
second attempt builds without the first attempt's cache entry. The first attempt still uses the
configuration cache. No trigger, right, runner, secret or check changes.

## Why

On 19 Nov the nightly run failed with a configuration-cache serialization error in AGP's
`ProcessNavigationXmlTask`. The retry reused the same broken cache entry and failed again within
a second, so it could never recover from this flake.

## Tests

No test was weakened or skipped. The `Android shell (debug APK)` job passed on #4002.

## Covers

- .github/
