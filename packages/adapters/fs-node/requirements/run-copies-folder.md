# fs-node.run-copies-folder

- Status: active
- Since: 0.1.0
- Source: HAL-6477 part A (plan decided by Liam in HAL-9301); the `RunCopies` port of `app.run-proposal-history-off`

The folder run copies shall keep each run's copy of the workspace as the folders `<runId>/base` and `<runId>/run` under the folder it is given, created with mode `700`, and give each side as a folder definition store of its own, so a path or a link in one side never reaches the other side or another run's copy. `folderOf` shall give the absolute path of the `run` side. `create` shall replace a copy left under the same run id by an empty one. `remove` shall delete both sides, removing a link in them without following it, and nothing when the copy is gone. `list` shall give, sorted, the names of the folders in the root that are run ids, and ignore every other entry, files and links included; a root that doesn't exist yet shall hold no copies. Every method shall throw a `RangeError` for a run id that is not a run id, so no id can name a folder outside the root.

## Examples

- Given a copy made for run `01JD8Q0000000000000000000A`,
  when a file is written in its `run` side,
  then the `base` side doesn't have it and `folderOf` names the folder that holds it.
- Given a link in the `run` side that points to a file outside the copy,
  when the copy is removed,
  then the copy is gone and the file it pointed to is still there.
- Given the root holds a file named like a run id, a folder named `.notes` and one copy,
  when the copies are listed,
  then only the copy's run id is given.
- Given the run id `../escape`,
  when a copy is created for it,
  then it throws a `RangeError` and nothing is made outside the root.
