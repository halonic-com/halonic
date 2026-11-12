# Decision: the release writes latest.json with the updater signature inside

- Task: HAL-7222 (workflow side of HAL-1206, file names settled on HAL-1119)
- Approval: the task [HAL-7222](/HAL/issues/HAL-7222) asks for this change; the maintainer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:LYnBmNteitPkaH8Fui2ySq9REfmXI9QhwM+bTSt7mxKwzeMWGkMF/JN9/7brj9YNaB19t/+oReu3rwIz0fNRCg==

## What changes

A new composite action, `.github/actions/updater-manifest`, signs the final installer with `tauri signer sign --app-version <version>` (the Tauri CLI pinned in `apps/studio`), checks that the signature is bound to that version and made by the expected key, writes `latest.json` (Tauri's static manifest, the signature text inside) and writes `SHA256SUMS` again. It deletes the `.sig` file, so none goes on the release.

In `.github/workflows/release.yml`:

- `sign-windows` (real runs) runs the action after Authenticode signing, over the signed installer, with the updater key from the `release` environment secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The key must match `plugins.updater.pubkey` in `tauri.conf.json`, or the run fails. Its own checksum step is replaced by the action's.
- `sign-test` (dry runs) runs the same action on the placeholder installer with a throwaway key made in the job and deleted before signing. No key is in any artifact.
- Both upload `release-files-signed`, and `draft-release` always publishes that artifact. It fails when `latest.json` is missing, a `.sig` file is present, the manifest's url doesn't name the installer, or `SHA256SUMS` doesn't match.

## Why

The app's updater reads `releases/latest/download/latest.json` and sets `requireSignedVersion`. The signature has to cover the bytes on the release, which Authenticode signing changes, so it is made after it. It is made in the same job, not a new one, because the `release` environment has a required reviewer: a second job in it would need a second approval for every release.

## Covers

- .github/
