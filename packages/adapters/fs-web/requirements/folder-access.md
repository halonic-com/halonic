# fs-web.folder-access

- Status: active
- Since: 0.1.0
- Source: HAL-3335, HAL-5766

When the browser answers `prompt` or `denied` for the opened folder, or refuses a call on it, every call on the browser folder store shall fail with a `FolderAccessError` of kind `denied` that says which the browser answered and the step that gives access back, and shall change nothing. The store shall never ask the person by itself; only `requestAccess()`, called from a click, shall ask, and it shall give whether access is back. Where the browser has no permission calls, the store shall work without them.

## Examples

- Given an opened folder after a reload, where the browser answers `prompt`,
  when the Studio reads `workspace.yaml`,
  then it fails with a `FolderAccessError` whose state is `prompt` and nothing is shown to the person.
- Given the same folder, when the person clicks to allow it and the browser grants it,
  then `requestAccess()` gives `true` and the read works.
