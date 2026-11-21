# Decision: the WSL setup gets an `installing-runtime` step

- Task: HAL-14644
- Approval: the task asks for this change (plan on HAL-14644, part 3); Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:VeKV8Q2/74pSBPJq3iUIm1GEn98RwoKAZcmWGpVhUR+35GOW/t01dqrWG9IxWUf6zW0ZLrbZBBrYVA1OhT57AA==

## What changes

`sandbox-srt.wsl-setup` lists its saved steps. The list gains `installing-runtime`, between `checking` and `done`, and points to the new requirement `sandbox-srt.wsl-runtime` for what that step does. Nothing the requirement said before is removed or weakened: every step, check and failure it names stays, and its examples and tests pass unchanged.

## Why

The image ships `/opt/halonic` empty, and nothing put the runtime there, so a fresh setup ended without one and repair couldn't fix it. The new step installs it after the distro passed its check, and running the setup again repairs a missing runtime without importing the distro again. Studio doesn't run the setup yet, so no user sees the change.

## Covers

- sandbox-srt.wsl-setup
