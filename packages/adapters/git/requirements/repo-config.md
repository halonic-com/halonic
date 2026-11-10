# git.repo-config

- Status: active
- Since: 0.1.0
- Source: HAL-2607; the `Vcs` port's hardening list; the desktop's `git-guard` (`repo_config.rs`)

When the git adapter runs a git call in a repository, it shall first list the repository's config and neutralise every program it names: it shall blank the filters the repository and every repository nested in it as a gitlink define, send its merge drivers to a conflict, and send its ssh and signing programs back to git's defaults. It shall refuse a repository whose own config sets `branch.<name>.mergeOptions`, and a git that ignores config given in the environment.

## Examples

- Given a repository whose config sets `filter.lfs.clean`,
  when the adapter runs git there,
  then git sees `filter.lfs.clean`, `smudge` and `process` blank.
- Given a repository whose config sets `branch.main.mergeOptions`,
  when the adapter opens it,
  then it refuses, naming the key.
