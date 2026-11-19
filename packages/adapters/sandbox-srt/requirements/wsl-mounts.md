# sandbox-srt.wsl-mounts

- Status: active
- Since: unreleased
- Source: HAL-5402 (W5 of the HAL-5407 review; design in HAL-3779 section 5.1); updater steps since HAL-12443 (W2b, W7)

The sandbox-srt adapter shall mount a Windows folder for an import through the image updater's fixed `import-mount` step, with the folder on standard input and never on the command line (W7): read-only with `noexec`, `nosuid` and `nodev`, for the `halonic` user only (`uid` and `gid` of `halonic`, `umask=077`), at a fresh random mount point in `/mnt/halonic`, which every session denies (W1). It shall accept only a mount point of that form from the step, and shall unmount it through the fixed `import-unmount` step, which takes the mount point's name only, when the import ends, also when it fails. The mount points a crash left behind are removed at the next start by the updater's `cleanup-import-mounts` step, only with `umount` and `rmdir` (Studio runs it, `studio.src-tauri.crates.agent-host.wsl-launch`). It shall mount a project on the Windows drive for the `halonic` user only (`umask=077`, `nosuid`, `nodev`), and only the one project folder, which must be an absolute Windows drive path without `..`.

## Examples

- Given an import whose clone fails,
  when the import ends,
  then the folder is unmounted and its mount point removed, and the clone's error is the one reported.
- Given an updater step that prints a mount point outside `/mnt/halonic` or not named `import-` and 32 hex digits,
  when the import mounts,
  then it throws before anything uses the mount.
- Given a folder path with `..` in it or a share path,
  when a mount is asked for,
  then it throws.
