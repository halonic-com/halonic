# Decision: the Android notices list the Gradle libraries, and ML Kit ships under a named exception

- Task: HAL-12585 (option B of the proposal on HAL-12579)
- Approval: Julian proposed option B on HAL-12579 (its proposal document) and assigned the implementation on HAL-12585; the board picked the official barcode-scanner plugin (decision 4c), which brings ML Kit. Julian reviews this as a licence PR, Liam signs this note
- Kind: internal

## What changes

`pnpm check:sbom --notices` learns `--gradle <file>`. It reads the list the Android app's
Gradle task writes (every library of the release runtime classpath, the licences its POM
names and the `third_party_licenses.txt` its AAR carries) and adds an "Android libraries
(Gradle)" section to `THIRD-PARTY-NOTICES.txt`. A POM names its licence in words, so
`gradle.names` in `tooling/check/licences.json` maps those words to SPDX IDs, and the ID must be
on the `shipped` list. The check fails on a name it can't map, a licence that isn't shipped, a
licence without a stored text, and a POM without a licence. `--with-licence` puts our own
`LICENSE` and `NOTICE` on top, because the APK ships one file.

The Apache-2.0 text is stored in `tooling/check/licence-texts/Apache-2.0.txt`, since androidx,
Material, CameraX and Kotlin name it only in their POMs. Eight Rust crates that only Android
links ship no licence file (`jni`, `jni-macros`, `jni-sys-macros`, `ndk`, `ndk-sys`,
`ndk-context`, `rustls-platform-verifier-android`, `cesu8`); their texts are stored in
`tooling/check/licence-texts/crates/`, pinned to the commit each crate was published from.

CameraX's `androidx.camera:camera-core` names two licences in its POM: Apache-2.0 and a
"BSD License" whose address is libyuv's `README.chromium`. The AAR's native code bundles libyuv,
which is BSD-3-Clause and needs its copyright line passed on. "BSD License" is too vague to map
for every library, so `gradle.bundled` accepts it only for `camera-core` with that exact address,
and the notices print libyuv's own `LICENSE` (stored in
`tooling/check/licence-texts/gradle/libyuv.txt`, copied from libyuv commit `8a0ee9fb`). Another
library naming "BSD License", or `camera-core` with another address, fails the check.

## The exception: Google's ML Kit and Play services

`gradle.proprietary` names nine Google libraries, each with the terms its POM must give:

- under the **ML Kit Terms of Service** (<https://developers.google.com/ml-kit/terms>):
  `com.google.android.gms:play-services-mlkit-barcode-scanning`, `com.google.mlkit:common`,
  `com.google.mlkit:vision-common`, `com.google.mlkit:vision-interfaces` and
  `com.google.mlkit:barcode-scanning-common`;
- under the **Android Software Development Kit License**
  (<https://developer.android.com/studio/terms.html>): `com.google.android.gms:play-services-base`,
  `play-services-basement`, `play-services-tasks` and `com.google.android.odml:image`.

They come with the barcode scanner (`tauri-plugin-barcode-scanner`, which uses
`play-services-mlkit-barcode-scanning` 18.1.0), which the board chose in decision 4c. Google's
terms allow shipping them inside an app, but they aren't open source, so they don't go on the
`shipped` list. Each gets a line in the notices that says so and names the terms' address,
followed by its embedded `third_party_licenses.txt` verbatim (Guava, Kotlin and the other
open-source code inside it). An exception holds only for the named artifact and only while its
POM names those terms: new terms, or a new Google library, fails the check until someone looks
at it and adds it here. The rest of that tree (`transport-*`, `firebase-encoders*`,
`firebase-components`) is Apache-2.0 and is checked like any other library.

## F-Droid

A build with ML Kit or Play services can't go into F-Droid's main repository, which refuses
non-free dependencies. There is no F-Droid plan today. If one comes, it needs a build flavour that
swaps the scanner for a free decoder (for example ZXing, Apache-2.0) or leaves it out, since typing
the pairing code works without a camera. Nobody should promise an F-Droid release until then.

## Covers

- tooling/check/
