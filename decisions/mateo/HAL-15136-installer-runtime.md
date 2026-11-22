# Decision: the Windows installer ships the WSL runtime

- Task: HAL-15136
- Approval: the board chose option A (the installer ships the runtime) on HAL-15093; Liam reviews the workflow change and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:fh6mxAyUvCs/HWFrll5JCBRTYp/BbPhfmCiGSuwhi27R7hMW743p5ZhiZ5q8w4yc4bhRBrpxvXqYLzWwrQs/Bg==

## What changes

- `windows/build-installer.ps1` gets `-Runtime <folder>`. With it, the script stops when `halonic-runtime.tar.gz` or `halonic-runtime.json` is missing or the manifest's SHA-256 isn't the archive's, copies both into `src-tauri/binaries/` and adds `tauri.runtime.conf.json`, which installs them next to `Halonic.exe`, where the shell reads the runtime it installs in Halonic's distro (#4466). Without it, nothing changes: Tauri refuses a resource whose file is missing, so the runtime has its own config and other builds (dev, `update-windows`, `studio-preview`, `network-capture`) don't need it.
- `ci.yml`: the runtime is packed by a new Linux job, `wsl-runtime`, instead of the agent host job's Linux leg. It runs under the same conditions as `installer-windows`, which now needs it, downloads `halonic-wsl-runtime` and builds with `-Runtime`. The install check lists the two files. `wsl-runtime` is added to `ci-ok`. Same read-only rights, no secrets, publishes nothing.
- `release.yml`: a new Linux job, `wsl-runtime`, builds the agent host and packs it with the version `<tag's version>+<12-digit commit>`, as a 7-day artifact. `studio` needs it and builds with `-Runtime`; `sign-test` and `sign-windows` download it and pack with `-Runtime`; `sign-test` checks the two files are installed. It holds no secret, and the runtime isn't a release file of its own: it reaches users only inside an installer the board has released. No approval gate changes.
- `installer.nsi`: page 1 says "Uses about 200 MB" instead of 145 (146 MB measured, plus the 53 MB archive), because CI fails when the size is off by a quarter.
- New requirement `studio.installer-wsl-runtime`, with tests.

## Why

The board chose option A on HAL-15093: Studio ships the runtime, so the WSL setup installs it from the install folder, with no download. The shell pins it by the manifest's SHA-256 and the updater checks it again as root; checking the pair at build time stops a mismatched pair before it ships rather than at the user's first start. The install lock this waited on (HAL-15134, #4512) is merged.

## Covers

- studio.installer-wsl-runtime
- .github/
