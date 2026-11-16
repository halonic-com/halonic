# sandbox-srt.wsl-import

- Status: active
- Since: 0.1.0
- Source: HAL-5402 (design in HAL-3779 section 5.1)

The sandbox-srt adapter shall import a Windows folder that is a git repository as a project in the `halonic` WSL distro: it shall mount the folder read-only only for the import (see `sandbox-srt.wsl-mounts`), clone it into the distro's project folder, give the clone the source's remotes, copy the source's uncommitted changes (modified, deleted and untracked files that aren't ignored), and make the `halonic` user the owner. It shall keep the source's other local branches, shall list the source's changes without reading the source's own git config, shall not follow a link in the source or in the clone, shall refuse a file path that reaches out of the project (also through a link in the clone), shall copy an untracked nested repository and leave a modified submodule's folder out, shall report a remote it can't copy, shall refuse a project that already exists, and shall remove what a failed import made.

## Examples

- Given a Windows repository with remote `origin` and one edited file,
  when it is imported as `acme`,
  then `acme` in the distro has the same remote and the edited file, and the mount is gone.
- Given a folder that isn't a git repository,
  when it is imported,
  then the import fails, nothing is left in the distro and the folder is unmounted.
