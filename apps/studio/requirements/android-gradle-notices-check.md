# studio.android-gradle-notices-check

- Status: active
- Since: unreleased
- Source: HAL-12776 (Julian's review of HAL-12585; Apache-2.0 section 4(d))

When a pull request changes the Android app, its Rust crates or plugins, the lockfile or the notices check, CI's Android job shall run the app's `thirdPartyLicences` Gradle task and `pnpm check:sbom --notices --gradle` on the list it writes, so a Gradle library under a licence we don't allow fails that pull request; the list shall carry each library's `META-INF/NOTICE` files, from its JAR or from the `classes.jar` of its AAR, and shall leave out modules with `pom` packaging, which ship no code.

## Examples

- Given a pull request that changes `apps/studio/src-tauri/Cargo.lock` or `tooling/check/licences.json`,
  when CI finds the changed areas,
  then the Android job runs, and after the debug APK it runs `./gradlew :app:thirdPartyLicences` and `pnpm check:sbom` with `--notices` and `--gradle` set to the file the task wrote.
- Given a library whose JAR holds `META-INF/NOTICE.txt`,
  when the Gradle task lists it,
  then its entry carries that file's text under `notices`, and the notices print it after the library's licence text.
- Given `kotlin-bom`, whose POM has `pom` packaging,
  when the Gradle task lists the classpath,
  then it leaves the module out.
