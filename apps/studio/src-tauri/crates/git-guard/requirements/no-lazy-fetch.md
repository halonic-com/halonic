# studio.src-tauri.crates.git-guard.no-lazy-fetch

- Status: draft
- Since: unreleased
- Source: HAL-16348, bringing over the git adapter's requirement `git.no-lazy-fetch` (HAL-16337)

When the shell runs git, it shall run it with lazy fetching off (`GIT_NO_LAZY_FETCH=1`), so a call that reads the repository never fetches an object it lacks from a remote. If a repository's `local` or `worktree` config sets `extensions.partialClone` or `remote.<name>.promisor`, in any case, then the shell shall refuse the call with `config_not_allowed`, naming the key, because git before 2.44 ignores that setting.

## Examples

- Given any allowed call,
  when the shell builds its git command,
  then the command runs with `GIT_NO_LAZY_FETCH=1`.
- Given a repository whose config sets `extensions.partialClone`,
  when the shell runs `status`,
  then the call is refused with `config_not_allowed`, naming the key.
- Given a repository whose config sets `remote.planted.promisor`,
  when the shell runs `status`,
  then the call is refused with `config_not_allowed`, naming the key.
- Given the user's global config sets `remote.origin.promisor`, or a repository with a plain `origin` remote,
  when the shell runs `status`,
  then the call runs.
