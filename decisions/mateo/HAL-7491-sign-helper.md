# Decision: the release builds Studio and signs the sandbox helper before it is packed

- Task: HAL-7491 (sign the sandbox helper inside the Studio installer before it is packed)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-7491](/HAL/issues/HAL-7491)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/cj8sQhhh2ZGatHg3v0inOI+1RwduutdwBPthnRda5fPWSrdyXGalSFRPelrXUaPlL9BISkQm3DdYY3Q/IDQCQ==

## What changes

`build-installer.ps1` gets a `-Step` switch. `build` compiles the app (`tauri build --no-bundle`) and every program it ships; `pack` checks the helper's signature and packs the installer (`tauri bundle`). Without it both run, so CI's installer job keeps working, now through the same two steps.

In `.github/workflows/release.yml`:

- A new `studio` job (Windows, read-only, no secrets) runs `-Step build` with `HALONIC_SANDBOX_SIGNER` set, so the helper's check of its own copy (S-4) is built in. It uploads what `pack` needs. The placeholder installer is gone.
- `sign-test` (dry runs) makes a throwaway certificate, trusts it on that runner only, signs the helper, packs, signs the installer, installs it, and checks that the installed helper is signed by the expected publisher, timestamped, and accepts its own copy (`setup`, then `remove` from the copy).
- `sign-windows` (real runs, `release` environment) signs only the helper with Azure Artifact Signing, packs, then signs the installer as before. Real runs stay refused while the CLI is a stub.

## Why

Liam's review of #2146: the release signed only the setup .exe, so the helper inside would ship unsigned, its UAC prompt would say "Unknown publisher", and S-4 relies on its publisher. Signing has to happen between compiling and packing. Compiling runs in a job without secrets, so the job that can reach the signing identity only signs, runs NSIS and checks.

The publisher for real runs is a repository variable, `SIGNING_PUBLISHER`, not an environment one, because the job that builds it into the helper isn't in the `release` environment. It's the certificate's name as Windows shows it, which isn't secret. Both jobs refuse to run without it.

## Covers

- .github/
