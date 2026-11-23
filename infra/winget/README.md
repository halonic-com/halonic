# winget manifests

Templates for Halonic's package on winget, `Halonic.Halonic` (HAL-1457). The
`winget` workflow (`.github/workflows/winget.yml`) fills in `{{VERSION}}`, the
installer's address and SHA-256, the release date and the release notes link,
checks the result with `winget validate` and opens the pull request on
[microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) from the
shared `halonic-dev` account's fork.

## When it runs

- **A release is published.** `release.yml` makes a draft; once a person
  publishes it, this workflow submits that version. A prerelease, or a tag
  with a `-` in it, is only validated.
- **By hand**, from the Actions tab, for a published tag. It submits only
  with `submit` on, for example when a first attempt failed.
- **A pull request that changes these files** validates them with a
  placeholder installer. Nothing is submitted.

Before it submits, the workflow checks the installer against the release's
`SHA256SUMS` and scans it with Microsoft Defender.

## What the manifests promise

- **Per user** (`Scope: user`), as the installer always installs. No
  installer switches: `/SANDBOX=1` needs an elevated prompt.
- **No `RequireExplicitUpgrade`**, so `winget upgrade --all` updates Halonic.
- **Installed apps** shows the name `Halonic`, the publisher `halonic` and the
  app's exact version. `ci.yml`'s installer job checks those three values, so
  winget doesn't offer an update that is already installed.

## Setup, once

The repository secret `WINGET_TOKEN` holds a classic GitHub token of
`halonic-dev` with the `public_repo` scope. Only the submit step reads it.
Without it, a submit fails with a message that says so.
