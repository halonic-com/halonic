# Decision: a preview build of main that builds and starts is published to halonic-preview

- Approval: the board's decision on HAL-18474 (standing yes for publishing Preview builds), asked for by HAL-18477; Liam approves and signs this note in review
- Kind: internal
- Signature:

## What changes

`.github/workflows/studio-preview.yml` gets a `publish` job. It runs only when the workflow runs on
`main` and the `installer` job passed: the installer built, updated an install of the release
version silently, and Halonic kept running for 20 seconds. It signs the preview's installer for the
Tauri updater with the Preview key, writes `latest.json`, and creates the pre-release
`v<version>` in the public repo `halonic-com/halonic-preview`, titled "Halonic <version> (Preview,
not for general use)", with the installer, its `.sig`, `latest.json` and `SHA256SUMS`. The
`installer` job now outputs the preview version.

The job is the workflow's only one with secrets. They live in a new environment, `preview-publish`
(deployments from `main` only, no reviewer, because the board gave a standing yes):
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the Preview updater key) and
`PREVIEW_PUBLISH_TOKEN` (a token that can write releases to `halonic-preview` and nothing else).
The board stores them (HAL-18479); until then the job fails at signing and publishes nothing. This
repo's own token stays read-only.

`.github/actions/updater-manifest` gets two inputs, `key` and `repo`. Empty, as `release.yml`
leaves them, nothing changes. `key: preview` checks the signature against the Preview public key
in `apps/studio/src-tauri/updater-keys.json`, and `repo` names the repository in the manifest's url.

## Why

The board decided on HAL-18474 that builds of `main` are published as a Preview, outside this
repo's Releases page, so the Studio's Preview update track has something to update to. It first
asked for the click test (HAL-18317) as the gate; on HAL-18477 (25 Nov) it decided that, until the
click test works and is quick, the Preview track doesn't wait for it, and building and starting the
installer is the minimum gate. A later pull request puts `needs: click-test` back once the click
test has merged and passed on a few `main` runs.

The Preview key is its own key, not the release key in the `release` environment: that key signs
the updates every installed 0.1.x Studio trusts, and it stays behind the board's review of each
release. A leaked Preview key can only reach installs set to the Preview track, whose updater
checks the Preview public key (HAL-18480).

## Tests

`apps/studio/src/studio/preview-publish.test.ts` (`studio.preview-publish`).

## Covers

- .github/
