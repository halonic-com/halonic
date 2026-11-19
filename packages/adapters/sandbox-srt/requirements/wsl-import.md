# sandbox-srt.wsl-import

- Status: active
- Since: unreleased
- Source: HAL-5402 (design in HAL-3779 section 5.1); runs as `halonic` since HAL-12443 (W2b)

The sandbox-srt adapter shall import a Windows folder that is a git repository as a project in the `halonic` WSL distro: it shall mount the folder read-only only for the import (see `sandbox-srt.wsl-mounts`), clone it into the distro's project folder, give the clone the source's remotes, and copy the source's uncommitted changes (modified, deleted and untracked files that aren't ignored). Only the mount and the unmount shall run as root, through the image's fixed updater steps; the import shall run everything else, git and the copy included, as the `halonic` user, so root never writes or deletes by path in a folder `halonic` can change and a link put there can't send root's writes elsewhere (W2b). It shall keep the source's other local branches, shall list the source's changes without reading the source's own git config, shall not follow a link in the source or in the clone, shall refuse a file path that reaches out of the project (also through a link in the clone), shall copy an untracked nested repository and leave a modified submodule's folder out, shall report a remote it can't copy, shall refuse a project that already exists, and shall remove what a failed import made.

## Examples

- Given a Windows repository with remote `origin` and one edited file,
  when it is imported as `acme`,
  then `acme` in the distro has the same remote and the edited file, and the mount is gone.
- Given a folder that isn't a git repository,
  when it is imported,
  then the import fails, nothing is left in the distro and the folder is unmounted.
- Given the `projects` folder replaced with a link to a folder only root can write,
  when a folder is imported,
  then nothing is written there: the clone runs as `halonic` and is refused, and root only mounts and unmounts.

## Notes

- The import mount has the `uid` and `gid` of `halonic` (HAL-12443), so its files belong to `halonic`, who runs git: `git clone` and `git fetch` need no `safe.directory`. The probe on a real WSL 2 distro (HAL-10927, 16 Nov 2026) showed the mount's files owned by root with mode 700 when it had no `uid=`; the real-PC test (HAL-10975) checks the mount with `uid=`.
- Git runs as `halonic` on the source's files, so a crafted git config in the Windows folder can at most do what `halonic` can. The changes are still listed with the clone's git folder, never the source's config.
- The distro needs GNU coreutils: busybox `realpath` has no `-m`, and the import fails at the copy of uncommitted changes without it.
