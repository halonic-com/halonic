# Decision: publish the WSL image and runtime as pinned release assets

- Approval: the task asks for this change (HAL-20591, PR 2 of the plan on HAL-20583, which Liam approved and Julian approved for security); Liam approves and signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:+750zobJfFyhXo4+r23FBWP4B+hNg/cdjh0xDeCOPJgJ18AHcCe0fuvIcUvvk+PRwgthPasiwJuh8DCjKSrMAQ==

## What changes

- `release.yml`: the `wsl-runtime` and `wsl-image` jobs write a pin for their part (`halonic-runtime.json`, new `halonic-wsl.json`: version, SHA-256, size, url; the runtime's also `minRuntime`). The url must be on the app's allow-list (`https`, port 443, no user name, `github.com` under the `halonic` or `halonic-preview` release downloads) or the job fails. `draft-release` adds both parts as `halonic-runtime-<version>.tar.gz` and `halonic-wsl-<image version>.tar.gz`, each checked against its pin and listed in `SHA256SUMS`, then checks that the release holds each under its pinned name and size. The dry run also packs an installer with `-PinParts` and checks it holds both pins and no archive. That installer is set aside, and the release keeps the bundled one.
- `release.yml`: the dry run's silent install passes `/SANDBOX=1`. Since HAL-17810 a silent install without it leaves out `vcruntime140.dll.pinned`, so the helper's setup exited 39 and every release dry run failed in `sign-test`.
- `studio-preview.yml`: the installer job pins both parts for `halonic-preview` and stages them as the publish job adds them. The publish job adds both to the pre-release, checked against the pins that went into the installer, and checks the uploaded names and sizes.
- No new secret, key, permission or environment. `draft-release` gains a sparse checkout of `part-pins.mjs` and `min-runtime.json`, with no credentials kept. The preview publish job reads two more artifacts of its own run.

## Why

The board's decision on HAL-20583: the WSL image and runtime become their own versioned release assets, so the installer can later ship without them (PR 5). Real runs still bundle both parts, so users see no change yet.

## Tests

`apps/studio/src/studio/installer-parts-pinned.test.ts` (`studio.installer-parts-pinned`) covers the allow-list, pinning, the archive checks, publishing and the workflow wiring. Release dry run `v0.1.1-test.20591b` (run 46006886957) is green. Its draft holds both parts, and their `SHA256SUMS` lines equal the pins. The installer with pins is 42.5 MB, the bundled one 186.5 MB. The preview run 46000913479 is green and staged both parts at their pins.

## Covers

- .github/
