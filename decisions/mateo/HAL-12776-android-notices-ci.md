# Decision: CI checks the Android Gradle libraries on every Android pull request

- Task: HAL-12776 (follow-up from Julian's review of HAL-12585, #3678 and #3679)
- Approval: Julian asked for these three changes in his review of HAL-12585 and opened HAL-12776 for them. Liam reviews this tooling and workflow PR and signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SkMe73r8d9FI3uNUiutF6UNtN0Ws/ni6FuWuJPSgmRZxqh5XaWEmu8hKv/f2S/IB+KS9pgWxs7LQzOj6njszBw==

## What changes

CI's Android job (the debug APK) now runs the app's `thirdPartyLicences` Gradle task after the
build and then `pnpm check:sbom --notices --gradle` on the list it writes, the same check the
Play build runs. The job's path trigger also covers the notices check itself
(`tooling/check/licences.json`, the stored licence texts, `gradle-notices.ts` and `sbom.ts`).
It already covered `Cargo.lock`, `Cargo.toml`, the Tauri plugin config and the lockfile.

The Gradle list now carries each library's `META-INF/NOTICE*` files, read from its JAR or from
the `classes.jar` inside its AAR, and the notices print them after that library's licence text
(Apache-2.0 section 4(d)). Modules with `pom` packaging (BOMs such as `kotlin-bom`) ship no code
and are left out of the list.

The new requirement `studio.android-gradle-notices-check` records this.

## Why

Until now only `android-play.yml` ran the Gradle check, and its triggers miss `Cargo.lock`,
`Cargo.toml` and the plugin config. A new Tauri plugin that brings Gradle libraries (the
scanner in #3585: ML Kit, CameraX) would first fail on release day. Now it fails on its own
pull request, and the ML Kit exception from `decisions/mateo/HAL-12585-01-gradle-notices.md`
gets a real run once #3585 builds on top of this.

## Covers

- .github/
- tooling/check/
