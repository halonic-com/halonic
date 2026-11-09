# studio.src-tauri.crates.git-guard.git-hardening

- Status: draft
- Since: 0.1.0
- Source: HAL-192, HAL-1508, HAL-1930; the `Vcs` port doc

When the shell runs git, it shall run it with every inherited `GIT_*` variable removed and its own config given in the environment, so it beats every config file: hooks pointed at an empty folder, `core.fsmonitor` off, no signing and no signature checks, no fetch, checkout, push, summary or diff inside a submodule, no alternate refs command, no automatic maintenance and no bundle named in the config. It shall run git with no terminal prompt, no system config, no pager, an editor that changes nothing, no password program, literal pathspecs and only the `https` and `ssh` transports. It shall pass `--no-ext-diff` and `--no-textconv` to `diff` and `log`, `--upload-pack=git-upload-pack` to `pull` and `--receive-pack=git-receive-pack` to `push`. If git ignores the config given in the environment, as git before 2.31 does, then the shell shall refuse the call with `git_too_old`. If the empty hooks folder has files or can't be read, then the shell shall refuse the call with `hooks_folder_not_empty` or `hooks_folder_unreadable`.

## Examples

- Given a repository with an executable `pre-commit` hook,
  when the shell runs `commit`,
  then the commit is made and the hook does not run.
- Given a repository whose config turns on signed commits with a planted ssh key command,
  when the shell runs `commit`,
  then the commit is made, unsigned, and the key command does not run.
- Given a remote whose URL is `ext::sh -c …`, with `protocol.ext.allow` set to `always`,
  when the shell runs `pull`,
  then git refuses the `ext` transport and nothing runs.
- Given a remote that is a local repository with its own `post-receive` hook,
  when the shell runs `push`,
  then git refuses the `file` transport and the hook does not run, because git would run that repository's own hooks and config, which no setting of the shell reaches.
- Given a repository whose config sets `diff.submodule=diff`, with a submodule whose own config names an external diff,
  when the shell runs `diff` or `log -p`,
  then the submodule's change is shown as a short summary and the external diff does not run.
- Given a repository with an alternate whose config names `core.alternateRefsCommand`,
  when the shell runs `pull`,
  then the command does not run.
- Given a repository that is due for automatic maintenance and whose config names `gc.recentObjectsHook`,
  when the shell runs `commit`,
  then the commit is made, no maintenance runs and the hook does not run.
- Given a repository whose config sets `fetch.bundleURI` to a bundle of another repository, outside the opened folders,
  when the shell runs `pull`,
  then nothing of the bundle is read into the repository.
