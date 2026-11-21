# memory.definition-store-left-out

- Status: active
- Since: unreleased
- Source: HAL-13334 plan (the memory stores apply the `DefinitionStore` port's `leaveOut` first, so the loader can rely on it)

When the memory definition store or the dry-run definition store is given `leaveOut` in `list()` or `version()`, it shall leave out the paths `isLeftOut` names, and its version shall cover only the files it doesn't leave out. When only left-out files have pending changes, the dry-run store's version with that `leaveOut` shall be the wrapped store's version with it. Both stores shall pass the `definitionSourceLeftOutContract` suite.

## Examples

- Given a memory store holding `repo/a.ts` and `workspace.yaml`,
  when it lists with `leaveOut: { folders: ["repo"] }`,
  then it gives `["workspace.yaml"]`.
- Given a dry run that has written only `repo/a.ts`,
  when its version is asked for with `leaveOut: { folders: ["repo"] }`,
  then it is the wrapped store's version with the same option, and without the option it starts with `dry-run:`.
