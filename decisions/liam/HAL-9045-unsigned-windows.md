# Decision: a release without Azure signing set up ships the Windows files unsigned

- Task: HAL-9045 (board decision on HAL-1197 and HAL-9016, 14 Nov: "Ship unsigned")
- Approval: the board decided to ship 0.1.0 unsigned; Mateo reviews the pull request, Liam signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:WTIn/oi8dbb2DGG7KzTSNDr4lV4kqrb2FYhK3eH9uFz8yw9WpCHc1jz/dya2VnreIoc3XT5cNwfeUfjpJBi3Bg==

## What changes

In `.github/workflows/release.yml`, the `build` job decides the publisher built into the sandbox helper: the throwaway one on a dry run, the repository variable `SIGNING_PUBLISHER` on a real run, and none on a dry run with the new `unsigned` input. No publisher means an unsigned run.

- `studio` builds the helper with that publisher, or with none.
- `sign-windows` (real runs) first checks the setup. With a publisher it needs all three Azure secrets of the `release` environment and signs as before. With none it needs no Azure secret at all, skips Azure login and both signing steps, packs, and checks that the installer has no signature. A publisher without the secrets, or secrets without a publisher, fails the run.
- `sign-test` (dry runs) with `unsigned` on makes no certificate, signs nothing, checks that the installer, the installed helper and its copy have no signature, and that the helper still sets up and removes the sandbox.
- Both still write `latest.json` and `SHA256SUMS` (LF) with the updater-manifest action. `draft-release` already lets a skipped signing job through. When the installer is unsigned, it starts the draft's notes with a line that SmartScreen will warn, how to run it anyway, and to check the download against `SHA256SUMS` first.

## Why

The board decided that 0.1.0 ships unsigned and signing follows in 0.1.1, once HAL-58 sets up Azure. A real run must not use a test certificate. The helper can't keep a publisher built in when it isn't signed: its check of its own copy (S-4) would refuse every install with exit 35, and no user could set up the sandbox. So an unsigned release builds it as dev builds are built, without the check. That loses S-4's protection against a swapped copy until signing is on; the task records it for the release card.

The switch is `SIGNING_PUBLISHER`, because the job that builds the helper can't read the `release` environment's secrets. The check in `sign-windows` makes the two halves agree, so setting both turns signing back on and a half-done setup never ships unsigned by mistake.

## Covers

- .github/
