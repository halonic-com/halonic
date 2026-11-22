# git.no-lazy-fetch

- Status: active
- Since: unreleased
- Source: HAL-16337

The git adapter shall run every git call with lazy fetching off (`GIT_NO_LAZY_FETCH=1`), so a call that reads the repository never fetches an object it lacks from a remote. It shall refuse a repository whose own config sets `extensions.partialClone` or `remote.<name>.promisor`, in any spelling git reads, because git before 2.44 ignores that setting.

## Examples

- Given an inherited environment with `GIT_NO_LAZY_FETCH=0`,
  when the runner builds a git call's environment,
  then the call gets `GIT_NO_LAZY_FETCH=1`.
- Given a repository whose config sets `extensions.partialClone`,
  when the adapter opens it,
  then it refuses, naming the key.
- Given a repository whose config sets `remote.planted.promisor`,
  when the adapter opens it,
  then it refuses, naming the key.
- Given a repository with a plain `origin` remote,
  when the adapter opens it,
  then it opens.
