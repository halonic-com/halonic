# Decision: the Play-signed APK check fails without ACCESS_LOCAL_NETWORK

- Task: HAL-13863 (follow-up from HAL-13372)
- Approval: the task asks for this change; Liam approves this note in his review of this pull request on HAL-13863
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:38zLKnz9dyz3RkYLwESpTFy02gmxtdRhlZ+N+lx2ehm5w9Deg3MtStwKu4d8dVoGAGzg9c99rU9CRKM/sNWIAw==

## What changes

In `.github/workflows/android-play.yml`, the step "Check the APK's manifest" of the job that fetches
and checks the APK Play signed gets one more check: the `aapt2 dump badging` output must list
`uses-permission: name='android.permission.ACCESS_LOCAL_NETWORK'`. If it doesn't, the step fails
with a message that names the permission.

Triggers, rights, runners, secrets and the other checks in the step don't change.

## Why

On Android 17, an app without `ACCESS_LOCAL_NETWORK` can't reach addresses on the local network, so
the phone app can't connect to the user's own computer (HAL-12253, HAL-13372). The job already checks
the version code, backups and cleartext http:// in the APK Google Play hands out. Checking the
permission there too means a release that lost it fails CI instead of reaching users.

## Tests

No test was weakened or skipped. The `grep` line was run by hand on badging output with and without
the permission line and passed and failed as it should. The job runs only on real Play builds, so its
first real run is the next Play build; today's `main` asks for the permission, so that build should
pass.

## Covers

- .github/
