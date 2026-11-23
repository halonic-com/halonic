# Decision: submit published releases to winget as Halonic.Halonic

- Approval: the task asks for this change (HAL-1457, from HAL-1448; package ID and token owner decided by the user on HAL-1456); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/yqMvqYE9weMhJrFCHKd/AKRYcL9Ubhf7dTJRbFC8XmT6e79ebH1hfzzpJtn2PaEzW/6AV2O26SUJdmy4CQoAw==

## What changes

- A new workflow, `winget.yml`. When a person publishes a release, it fills in the manifests in `infra/winget/` with the version, the installer's address and its SHA-256, checks the installer against `SHA256SUMS`, scans it with Defender, runs `winget validate` and opens the pull request on `microsoft/winget-pkgs` with a pinned `wingetcreate`. Prereleases and tags with a `-` are validated, never submitted. A pull request that changes these files only validates, with a placeholder installer, and reads no secret.
- The token is the repository secret `WINGET_TOKEN` of the shared `halonic-dev` account. Only the submit step gets it, through its environment.
- `ci.yml`'s installer job also checks that Installed apps shows `Halonic` with exactly the app's version, so winget doesn't offer an upgrade to the version that is already installed.

## Why

The release texts name `winget install Halonic.Halonic`. Opening the winget pull request from the release itself means no one has to do it by hand for each version, and the token stays in the repository's secrets. Publishing a release stays a person's step, approved by the board, so the workflow submits nothing the board hasn't released.

## Tests

The workflow's pull request run fills in and validates the manifests on a Windows runner. Submitting can only be tried once a release is published.

## Covers

- .github/
