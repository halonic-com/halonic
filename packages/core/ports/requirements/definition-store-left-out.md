# ports.definition-store-left-out

- Status: active
- Since: unreleased
- Source: HAL-13334 plan, with Liam's changes (`node_modules` is opt-in through the same option); follow-up to HAL-13291

When `list()` or `version()` of a `DefinitionSource` is given `leaveOut`, the source shall leave out every path that is one of its `folders` or inside one, and every path with a segment that is one of its `names`, comparing segments as `segmentAsOpened` gives them; and `version()` shall cover only what `list()` gives with the same `leaveOut`, unless the version names a whole snapshot, such as a commit. If a folder is an unsafe path or a name is not one safe segment, then the source shall reject with a `RangeError`. When `list()` or `version()` is called without `leaveOut`, the source shall behave as it does without options. A left-out file shall still read, write and remove as any other. The ports package shall export the rule as `checkLeaveOut` and `isLeftOut`, so every store applies it the same way.

## Examples

- Given a source holding `repo/src/a.ts`, `repository.md` and `workspace.yaml`,
  when it lists with `leaveOut: { folders: ["repo"] }`,
  then it gives `["repository.md", "workspace.yaml"]`.
- Given a source holding `node_modules/x/index.js`, `tools/Node_Modules/y.js` and `tools/run.ts`,
  when it lists with `leaveOut: { names: ["node_modules"] }`,
  then it gives `["tools/run.ts"]`.
- Given the same source,
  when it lists without options,
  then it gives all three files.
- Given two content-hashed sources that differ only in `repo/src/a.ts`,
  when each is asked for its version with `leaveOut: { folders: ["repo"] }`,
  then both versions are the same, and they differ without the option.
- Given any source,
  when it lists with `leaveOut: { folders: ["a/../b"] }` or `leaveOut: { names: ["a/b"] }`,
  then the call rejects with a `RangeError`.
- Given a source holding `repo/src/a.ts`,
  when it reads `repo/src/a.ts` after listing with `leaveOut: { folders: ["repo"] }`,
  then it gives the file's text.
