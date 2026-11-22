# Decision: the WSL image records its version, and the setup reports an older one

- Task: HAL-15161
- Approval: Liam's yes to A+B on HAL-15168; this is B. Liam reviews it as a security PR and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nMTFmM98YBez/K8jWcDz6Y2xdK0IEHf5u0jJJIOXAyntjl30ynN3+0+1jD6iuqXQ4UU7TJ78Os5I+qUHEUC8CQ==

## What changes

The image had no version of its own (only its Debian snapshot), so a change to `customize.sh`, the package list or `wsl.conf` couldn't be told apart in a distro. Now `infra/wsl-image/image-version` holds one whole number (starting at `1`), `customize.sh` writes it to `/usr/share/doc/halonic-image/IMAGE`, and `halonic-runtime status` adds `"image":"<n>"` (empty when the file is missing or holds anything but digits). The WSL image workflow fails a pull request that changes `build.sh`, `customize.sh`, `snapshot.conf` or `files/wsl.conf` without raising the number.

`sandbox-srt.wsl-setup` gains one sentence and one example: when the setup is done it also reports the residual `image-outdated` when the distro's image is below the lowest one Studio works with (`WSL_IMAGE_MIN`, now `1`; no version counts as `0`), and it never unregisters or imports the distro for it. Nothing the requirement already said is removed or weakened.

## Why

A re-import deletes what is kept in the distro (the projects in `halonic`'s home folder), and `sandbox-srt.wsl-remove` allows an unregister only after the person has chosen what happens to their files, so the setup can't replace an old image on its own. Reporting it is the safe first step: no published image needs a newer one yet, and part A (#4528) already brings updater changes with the runtime. A flow that offers a re-import comes only when a change needs a new image, and goes to the board as a UX approval then.

The residual isn't shown to anyone yet: Studio words residuals, and this one has no words until that flow exists.

## Trust

`status` reads one root-owned file in the image (`/usr/share/doc/halonic-image`, which `halonic` can't write) and prints it only when it is digits, so nothing from it reaches the JSON unchecked. The updater still runs no file `halonic` can write (W2).

## Covers

- sandbox-srt.wsl-setup
- .github/
