# studio.android-third-party-notices

- Status: active
- Since: unreleased
- Source: HAL-12585 (option B of HAL-12579; Apache-2.0 section 4(a), Google's `third_party_licenses.txt`)

When the Android release bundle is built with `HALONIC_THIRD_PARTY_NOTICES=1`, as the Android Play build sets it, the app's Gradle build shall write `THIRD-PARTY-NOTICES.txt` with `pnpm check:sbom --notices --with-licence`, listing our `LICENSE` and `NOTICE`, the npm libraries, the Rust crates of `src-tauri` for the three Android targets and the libraries of the release runtime classpath, and shall ship it in the bundle as the asset `THIRD-PARTY-NOTICES.txt`; the Android Play build shall fail when the built bundle or the APK Play signed lacks that asset or one of its parts, and the release shall attach the APK's copy as `THIRD-PARTY-NOTICES-android.txt`.

## Examples

- Given the app's Gradle file,
  when `HALONIC_THIRD_PARTY_NOTICES` is `1`,
  then the release variants' assets come from the `thirdPartyNotices` task, which runs `pnpm check:sbom` with `--notices`, `--with-licence`, `--gradle` and `--cargo-target` set to `aarch64-linux-android`, `armv7-linux-androideabi` and `x86_64-linux-android`, after the `thirdPartyLicences` task has listed the `universalReleaseRuntimeClasspath`.
- Given the Android Play build,
  when it builds the release bundle,
  then it sets `HALONIC_THIRD_PARTY_NOTICES` to `1` and then checks `base/assets/THIRD-PARTY-NOTICES.txt` of the bundle with `check-notices.mjs`.
- Given a notices file that opens with our licence, has our `NOTICE`, the npm, Rust and Gradle sections, an androidx library and the `jni` crate,
  when `check-notices.mjs` reads it,
  then it finds no problem; without the Gradle section it names that section.
- Given a real release,
  when the draft release is created,
  then it carries `THIRD-PARTY-NOTICES-android.txt`, taken out of the APK Play signed, with its line in `SHA256SUMS`.
