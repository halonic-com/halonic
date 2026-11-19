# contracts.definition-source-left-out

- Status: active
- Since: unreleased
- Source: HAL-13334 plan; `DefinitionSource` port v3 (`ports.definition-store-left-out`)

Where an adapter implements `DefinitionSource` and opts into `definitionSourceLeftOutContract`, it shall list, without options, every file under a `node_modules` folder as before; with `leaveOut`, leave out the given folders, at the root or deeper and in any case, and every path under a given folder name at any depth, also for a listing of a folder inside them; reject an unsafe folder or name with a `RangeError`; still read a left-out file; and, unless its version names a whole snapshot, give the same version for two workspaces that differ only in a left-out file and different versions for two that differ in a listed one.

## Examples

- Given a source holding `repo/src/a.ts`, `repository.md` and `workspace.yaml`,
  when it lists with `leaveOut: { folders: ["repo"] }`, or a source holding `Repo/b.ts` instead of `repo/src/a.ts` lists with the same option,
  then it gives `["repository.md", "workspace.yaml"]`.
- Given a source holding `node_modules/x/index.js` and `tools/Node_Modules/y.js`,
  when it lists `tools` with `leaveOut: { names: ["node_modules"] }`,
  then it gives `[]`.
- Given an adapter whose version is a content hash,
  when two sources differ only in `repo/src/a.ts` and both are asked for their version with `leaveOut: { folders: ["repo"] }`,
  then the two versions are the same.
