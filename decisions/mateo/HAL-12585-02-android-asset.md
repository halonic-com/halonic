# Decision: the Android app ships its third-party notices, and the release attaches them

- Task: HAL-12585 (option B of the proposal on HAL-12579)
- Approval: Julian proposed option B on HAL-12579 (its proposal document) and assigned the implementation on HAL-12585. Julian reviews this as a licence and release-gate PR, Liam signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:aJGSzQI/Ho4cVowApO9/uJCjIpuLdjWgEZZ83KVnEu8tzuri8l0LAuGM25W1P+TzrtTH/BO/+WJ+3smPqJDKAA==

## What changes

The Android Play build sets `HALONIC_THIRD_PARTY_NOTICES=1` when it builds the release bundle.
With it, the app's Gradle build lists the libraries of the release runtime classpath (the
`thirdPartyLicences` task: each POM's licences and each AAR's `third_party_licenses.txt`), runs
`pnpm check:sbom --notices --with-licence --gradle` for the three Android Rust targets, and adds
the `THIRD-PARTY-NOTICES.txt` it writes to the release assets. A licence we don't allow fails the
build. The workflow checks the asset in the built bundle and in the APK Play signed
(`check-notices.mjs`), and passes the APK's copy to the release, which attaches it as
`THIRD-PARTY-NOTICES-android.txt` with its line in `SHA256SUMS`. CI also builds the Rust crate
part for the Android targets on every pull request, next to the Windows one.

The new requirement `studio.android-third-party-notices` records this. There is no licence screen
in the app: that would be a UI change for the board.

## Why

The APK and the Play bundle shipped no licence notices: not ours, not the npm libraries, not the
Rust crates and not the Gradle libraries, whose Apache-2.0 licence asks for a copy of its text.
The release's `THIRD-PARTY-NOTICES.txt` covered the Windows target only. The ML Kit exception and
its F-Droid consequence are in `decisions/mateo/HAL-12585-01-gradle-notices.md`.

## Covers

- .github/
