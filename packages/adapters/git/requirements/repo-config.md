# git.repo-config

- Status: active
- Since: 0.1.0
- Source: HAL-2607; the `Vcs` port's hardening list; the desktop's `git-guard` (`repo_config.rs`)

When the git adapter runs a git call in a repository, it shall first list the repository's config again and neutralise every program it names: it shall blank the filters the repository and every repository nested in it as a gitlink define, send its merge drivers to a conflict, send its ssh and signing programs back to git's defaults, blank its interactive diff filter and trailer commands, and give every call that shows diffs (`diff`, `log`, `show`, `whatchanged`) `--no-ext-diff --no-textconv` after its other options, so its external diff, diff commands and textconv programs don't run. It shall refuse a repository whose own config sets `branch.<name>.mergeOptions`, `include.path` or `includeIf.<condition>.path`, and a git that ignores config given in the environment.

## Examples

- Given a repository whose config sets a filter that `.gitattributes` applies to every file,
  when the adapter runs `add` there,
  then the filter's program doesn't run.
- Given a repository whose config sets `branch.main.mergeOptions`,
  when the adapter opens it,
  then it refuses, naming the key.
- Given a repository whose config sets `diff.external` and `diff.acme.textconv`,
  when the adapter runs `diff` or `log -p` there,
  then neither program runs.
- Given a repository the adapter has opened,
  when its config gains a filter before the next call,
  then the filter doesn't run on that call.
