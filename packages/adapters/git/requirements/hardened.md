# git.hardened

- Status: active
- Since: 0.1.0
- Source: HAL-2607, HAL-191; plan section 11 ("git always hardened"); the `Vcs` port's hardening list; the desktop's `git-guard` (`runner.rs`)

The git adapter's runner shall run every git call hardened, whether the workspace is trusted or not: `core.hooksPath` pointed at a folder that must stay empty, the port's hardening config given in the environment, every inherited `GIT_*` variable removed, no system or user config, no pager, editor or password prompt, only `https` and `ssh` remotes, a `PATH` cut down to its absolute folders, and git never looking for a repository above the folder it runs in. It shall refuse to run while the hooks folder isn't empty, or in a folder that isn't an absolute path. It shall pass each argument to the program as it is, with no shell, give it only the environment it builds, and stop it, with every program it started, when it passes its time or output limit.

## Examples

- Given an environment with `GIT_DIR` set to another repository,
  when the runner runs git in a repository,
  then git works on that repository, not the other.
- Given a git call that runs past its time limit,
  when the limit passes,
  then the call is stopped and rejects.
