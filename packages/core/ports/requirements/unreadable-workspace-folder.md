# ports.unreadable-workspace-folder

- Status: active
- Since: 0.1.0
- Source: HAL-4561, a follow-up to HAL-4511

The ports package shall give `DefinitionSource` adapters one error, `UnreadableWorkspaceFolderError`, for `list()` to throw when the account may not read a folder under the store's root, with the folder's workspace path as its `path`, and an `isUnreadableWorkspaceFolderError(value)` check that tells it apart by its `name` and `path`, without `instanceof`, so it works when an adapter has its own copy of the package. A store shall not leave such a folder out of `list()`, because that would hide the files in it without a word.

## Examples

- Given `new UnreadableWorkspaceFolderError("hubs/support", "The folder can't be read.", { cause })`,
  when it is checked with `isUnreadableWorkspaceFolderError`,
  then it passes, its `path` is `hubs/support`, its `name` is `UnreadableWorkspaceFolderError` and its `cause` is kept.
- Given an `Error` from another copy of the package, named `UnreadableWorkspaceFolderError` with `path: "hubs/support"`,
  when it is checked,
  then it passes.
- Given a plain `Error`, an `Error` with that name but no `path`, or an object that only looks like one,
  when it is checked,
  then it fails.
