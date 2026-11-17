# sandbox-srt.wsl-mounts

- Status: active
- Since: unreleased
- Source: HAL-5402 (W5 of the HAL-5407 review; design in HAL-3779 section 5.1)

The sandbox-srt adapter shall mount a Windows folder for an import read-only with `noexec`, `nosuid` and `nodev`, at a fresh random mount point under its own folder, and shall unmount and remove the mount point when the import ends, also when it fails. It shall remove the mount points a crash left behind at the next start, only with `umount` and `rmdir`. It shall mount a project on the Windows drive for the `halonic` user only (`umask=077`, `nosuid`, `nodev`), and only the one project folder, which must be an absolute Windows drive path without `..`.

## Examples

- Given an import whose clone fails,
  when the import ends,
  then the folder is unmounted and its mount point removed, and the clone's error is the one reported.
- Given a mount point left by a crash,
  when Halonic starts,
  then it is unmounted and removed, and one that can't be removed is reported.
- Given a folder path with `..` in it or a share path,
  when a mount is asked for,
  then it throws.
