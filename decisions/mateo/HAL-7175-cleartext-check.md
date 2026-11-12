# Decision: the Play build checks the bundle's cleartext setting

- Task: HAL-7175
- Approval: Liam approves this note in review on HAL-7175, following the cleartext decision on HAL-1140 and HAL-1375
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:flGiX8r5iFWiEP5YJL/sS3JvdZcxB5wKxptABT3o3W/T/qEmVdv9en+Q8hlRuCbduRnqp3OpR2TeOE4ceEeTCQ==

## What changes

The `build` job of `.github/workflows/android-play.yml` gets one step after the release bundle is
built and before it is uploaded. It reads `base/manifest/AndroidManifest.xml` out of the built
`.aab` and fails the job unless `<application>` has `android:usesCleartextTraffic` compiled to
`true` and has no `android:networkSecurityConfig`. The check is a new script,
`apps/studio/src-tauri/android/check-cleartext.mjs`, that decodes the manifest's protobuf format
with Node alone. It starts no process and needs no outside package or Android tool.

The workflow's pull request trigger also covers the files that decide that setting: the check
itself, the app's `build.gradle.kts`, `AndroidManifest.xml`, its `res/xml/` files and
`tauri.android.conf.json`. Such a pull request runs a dry run, as before.

## Why

HAL-1140 decided that every build, release included, allows plain `http://`: the app talks to
the user's computer on the home network, which has no certificate, and the shell's connect check
limits `http://` to home-network addresses. That setting lives in a Gradle placeholder and the
manifest, so a later change to `gen/android` or the Tauri config could drop it (the app can't
connect) or replace it with a network security config (from Android 7 that file decides
cleartext instead). Checking the built file catches both, whatever caused them.

## Cost

A few seconds in the `build` job. Pull requests that change one of the listed files run the Play
dry run, about 12 minutes on a runner.

## Tests

Run on the dry-run bundle of #2070 (`halonic-0.1.0-454062.aab`): it passes. Hand-made manifests
with the setting `false`, missing, a plain string with no compiled value, or with a network
security config added each fail with their own message, and so does a file that isn't a
protobuf manifest.

## Covers

- .github/
