# Decision: CI packs the agent host as the WSL runtime archive, build only

- Task: HAL-14644
- Approval: the task asks for this change (plan on HAL-14644, part 1); Liam reviews it and signs this note as the CTO
- Kind: internal

## What changes

CI's agent host job, on Linux and outside merge groups, packs the executable it just built with `infra/wsl-image/runtime-archive.sh` and keeps `halonic-runtime.tar.gz` and `halonic-runtime.json` as a 7-day artifact. The job's path filter now includes the script, and the WSL image workflow runs shellcheck on it. No check is removed or weakened, and nothing is published.

## Why

Nothing installs the runtime in Halonic's WSL distro, and no runtime archive was built anywhere. Studio's setup step and the shell's install command (the next parts of HAL-14644) need an archive the distro's updater accepts, built the same way every time.

## Covers

- .github/
