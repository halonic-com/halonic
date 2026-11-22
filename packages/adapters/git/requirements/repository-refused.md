# git.repository-refused

- Status: active
- Since: unreleased
- Source: HAL-16336

When the git adapter refuses a repository, because its git files or the objects it reads are outside its folder, a repository nested in it keeps its git files outside the workspace, or its config sets a key `git.repo-config` refuses, it shall throw an error whose `kind` is `denied`, whose message says what the repository does, and whose `fix` says the one step that lets Halonic work in it.

## Examples

- Given a repository whose `.git` is a `gitdir:` file pointing elsewhere, when it is opened, then it throws `denied` with "keeps its git files outside the folder" and the fix "Use the repository's own folder, with its .git folder inside it, not a linked worktree or a submodule.".
- Given a repository whose config sets `include.path`, when it is opened, then it throws `denied` with "The repository's config sets include.path, which Halonic doesn't allow." and the fix "Remove it from .git/config and try again.".
- Given a repository whose alternates name a folder that doesn't exist, when it is opened, then it throws `denied` with the fix "Remove that line from .git/objects/info/alternates and try again.".
