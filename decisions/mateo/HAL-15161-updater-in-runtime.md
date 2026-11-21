# Decision: the runtime updater travels in the runtime archive

- Task: HAL-15161
- Approval: Liam's yes to A+B on HAL-15168, with conditions; Liam reviews it as a security PR and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:9HtGdsyzEEXaDxBOxmYQoEzDRh1ResgkPAqmoFxuiYkJyjRUVmUBJqAyxGejpH3fGCk7lXf0UUHcL9CdDlLFBg==

## What changes

The runtime updater (`/usr/local/sbin/halonic-runtime`, which runs as root) shipped only in the WSL image, and the README said a runtime archive must not be able to replace it. Now `runtime-archive.sh` packs it as `sbin/halonic-runtime`, and the updater's `install` puts the new version's copy in place before it switches `current`; `rollback` puts the target version's copy in place. A version without one gets the image's copy back, kept once as `/usr/local/sbin/.halonic-runtime.image`, so the updater always belongs to `current`. `sandbox-srt.wsl-runtime` changes only in wording: the step runs "the distro's updater", not "the image's". Nothing it requires is removed or weakened.

## Why

A distro got a changed updater only through a new image import, and the setup can't re-import silently: that unregisters the distro and deletes the projects kept in it, which `sandbox-srt.wsl-remove` allows only after the person has chosen what happens to their files. The updater already trusts the SHA-pinned runtime archive enough to run its code in every sandbox session, so taking the updater from the same checked archive adds no new source of trust (W2).

## Conditions (Liam, HAL-15168) and where they're met

1. Same trust anchor: Studio checks the SHA-256 against its own build, the updater checks it again, and the copy comes only from the unpacked, root-owned version folder.
2. No swap window: `sbin/halonic-runtime` must be a plain file (a link is refused, exit 5); the copy goes to a temporary file in `/usr/local/sbin`, is made `root:root 0755`, synced, then renamed. `/usr/local/sbin` must be root's with no group or other write.
3. Rollback follows the runtime version, not a single `.previous` file (the v2, v3 without `sbin/`, rollback to v2 case is tested).
4. The new copy runs once (`status`) before the rename; if it fails, the old one stays, `current` doesn't change and `install` exits 5.
5. `check.sh` tests all of these; the updater has no requirement ids of its own, as before.

## Covers

- sandbox-srt.wsl-runtime
- .github/
