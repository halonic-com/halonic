# Decision: the installer notices list the Microsoft C++ runtime, and the fetch stops for arm64

- Requirement: `studio.installer-third-party-notices` (`apps/studio/requirements/installer-third-party-notices.md`)
- Task: HAL-8151, follow-up from Liam's review of HAL-8068
- Approval: the task asks for this change; Liam signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:VAxgf5pQ3+7wqkuvoc+brZJ5hsoFX47h9BDMIn2VL/3tXcWyyvLJWc1CCZFQE+GI40iGrXh6c8IyeRbdH+TlCw==

## What changes

`studio.installer-third-party-notices` gets two examples:

- `windows/build-installer.ps1` appends `windows/vcruntime-notice.txt` to `THIRD-PARTY-NOTICES.txt` after `check:sbom` and before `tauri build`.
- `windows/fetch-vcruntime.ps1` stops for any `-Target` other than `x86_64-pc-windows-msvc`.

## Why

The installer ships Microsoft's `vcruntime140.dll`, which `check:sbom` can't list because it is neither an npm library nor a crate. The fetch script only extracts the x64 DLL, so an arm64 installer must not be able to ship it. The notice text itself is open on HAL-8157; this note covers only the requirement's examples.

No check is removed or weakened.

## Covers

- apps/studio/requirements/
