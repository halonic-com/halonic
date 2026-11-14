# fs-node.folder-run-copies

- Status: active
- Since: 0.1.0
- Source: `RunCopies` of `@halonicjs/app`; HAL-6477; the folder rules of `fs-node.blob-store-files`

The fs-node run copies shall keep each run's copy of the workspace as one folder named by the run's id in a folder given to it, with two sides, `base` and `run`, each read and written as a folder definition store, so a link made by a program that writes in `run` is never followed. `create` shall make the root and the copy private to the user, with both sides empty, and shall empty a copy left from an earlier start of the same run; `folderOf` shall give the absolute folder of the `run` side; `remove` shall delete the copy and do nothing when it is gone; `list` shall give the ids of the copies, sorted, and none when the root isn't there. A run id that isn't 1 to 64 letters, digits, `-` or `_` shall throw a `RangeError` and never reach a path.

## Examples

- Given a created copy,
  when a file is written to its `base` side,
  then the `run` side doesn't have it, and both sides' folders are the run's own.
- Given a run id of `../other`,
  when its copy is created,
  then it throws a `RangeError` and nothing is made.
- Given a copy with a file in its `run` side,
  when the run's copy is created again,
  then both sides are empty.
- Given a symbolic link in the `run` side that points to a file outside it,
  when the side is read through its store,
  then the read is refused and the link's file isn't read.
- Given two copies, one removed twice,
  when the copies are listed,
  then only the other one is, and the second removal did nothing.
