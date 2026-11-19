# Decision: the WSL import runs as `halonic`, and root only mounts and unmounts

- Task: HAL-12443
- Approval: Julian asked for this fix as finding F1 of the srt-wsl security review (https://paperclip.halonic.com/HAL/issues/HAL-12443), and reviews it. A team decision with no board card.
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:UHfYe/5VALfppNvasHLfuRPsRu3p2NPGgNaGhX4w1nBEJECDDgH2YZWxgy+A3dDZDsukx8dohcFoCW0ZaZ1zDA==

## What changes

The WSL import ran `git clone`, `mkdir -p`, `cp` and `rm -rf` as root by path in the `halonic` user's `projects`
folder, which `halonic` owns. A `halonic` process could swap `projects` (or the project folder between the
checks and the writes) for a link and send root's writes and deletes anywhere, and root in the distro reaches
the Windows drive (W2b). Now:

- `WslRoot` becomes `WslDistro`: `run` runs as `halonic`, and `runtime` runs only the image updater's fixed
  `import-mount` and `import-unmount` steps as root (pull request #3615). The Windows folder goes to
  `import-mount` on standard input, never on the command line (W7).
- The import mount has the `uid` and `gid` of `halonic` and sits in `/mnt/halonic`, which every session denies
  (W1), instead of `/mnt/halonic-import`. Git and the copy run as `halonic`, so no `chown -R` and no
  `safe.directory`. The source's config is still never read for the change lists.
- The adapter's own `cleanupImportMounts` (root `ls`, `umount`, `rmdir`) goes: Studio already runs the
  updater's `cleanup-import-mounts` step at each start (`studio.src-tauri.crates.agent-host.wsl-launch`).
  `IMPORT_MOUNT_OPTIONS` goes too, as the updater now sets them.
- A project can't be named like an import mount (`import-` and 32 hex digits), so a project's mount in
  `/mnt/halonic` is never taken for one. Windows folders with the DEL character are refused, as the updater
  refuses them.

Nothing calls the import yet, so nothing changes for a user. The requirements say the above, and the
`sandbox-srt.wsl-import` note on the HAL-10927 probe now says that the real-PC test (HAL-10975) checks the
mount with `uid=`. A new test replaces `projects` with a link to a root-only folder: nothing is written there,
and root only mounts and unmounts.

## Covers

- sandbox-srt.wsl-import
- sandbox-srt.wsl-mounts
- sandbox-srt.wsl-projects
