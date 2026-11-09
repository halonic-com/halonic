# studio.src-tauri.crates.git-guard.repo-config

- Status: draft
- Since: 0.1.0
- Source: HAL-192, HAL-1930 (neutralise, don't refuse, decided by Liam), HAL-2312 (refuse `branch.<name>.mergeOptions`, which no override reaches); the `Vcs` port doc

When the shell runs git in a repository, it shall first list the config git would use, following includes, and neutralise every program a `local` or `worktree` entry names, so the call still runs and nothing planted in the repository runs: every filter driver it defines, and every filter driver of a repository nested in it as a gitlink, is blanked; every merge driver it defines reports a conflict; `core.sshCommand` and the signing programs (`gpg.program`, `gpg.<format>.program`, `gpg.ssh.defaultKeyCommand`) go back to the value from outside the repository or to git's default; and its credential helpers are dropped, keeping the user's own. What the repository's config names otherwise is neutralised on every call (requirement `git-hardening`). If git can't list the config or the index, or can't locate a nested repository that has a `.git`, then the shell shall refuse the call with `repository_unreadable`. If a `local` or `worktree` entry sets `branch.<name>.mergeOptions`, which no override reaches, then the shell shall refuse the call with `config_not_allowed`. Every git config key that runs a program or reads a file is listed, with how the shell handles it, in `docs/config-keys.md`; a git upgrade or a new subcommand on the allow-list is checked against that list.

## Examples

- Given a repository with `filter.x.clean` set and `* filter=x` in `.git/info/attributes`,
  when the shell runs `add -A` and `commit`,
  then the content is committed as it is and the filter does not run.
- Given a filter called `a=b`, a name that `-c` would split in the wrong place,
  when the shell runs `add -A`,
  then the filter does not run.
- Given a repository whose config includes a file that defines a filter,
  when the shell runs `status`,
  then the call runs and the filter does not.
- Given a nested repository, added as a gitlink, whose own config defines a filter,
  when the shell runs `add -A`, `status` or `diff`, which look inside it,
  then the filter does not run.
- Given a nested repository, added as a gitlink, whose `.git` file points at a folder that doesn't exist,
  when the shell runs `status`,
  then the call is refused with `repository_unreadable`.
- Given the user's global config names a credential helper and the repository's config names another,
  when the shell runs `push`,
  then only the user's helper is asked.
- Given a repository whose config sets `branch.main.mergeOptions` to `-F` and a file outside the opened folder,
  when the shell runs `pull` or `status`,
  then the call is refused with `config_not_allowed`, and plain git's `pull` would make that file the merge commit's message.
