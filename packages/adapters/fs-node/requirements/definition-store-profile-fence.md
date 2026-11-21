# fs-node.definition-store-profile-fence

- Status: draft
- Since: unreleased
- Source: HAL-15201 (Liam's approval, question 3); the shell's `Fence` in the `workspace-files` crate (HAL-7039)

Given a folder to fence, the folder definition store shall never serve a path in that folder, even when its root holds it. It shall work out where the fenced folder is under the root from both real paths, as far as they exist, so a profile not made yet or reached through a link is fenced too, and compare names as a file system that folds case would open them. `read`, `write`, `remove` and `list` of a path that is the fenced folder or inside it shall throw the `RangeError` a private path gets, the shell's `private_path`; `list`, the file count and the version shall leave the folder out; and the watch shall not report changes in it. When the root is the fenced folder or inside it, every call that takes a path, and a `list` of the whole root, shall throw. Without a folder to fence, it serves every path the port allows.

## Examples

- Given a root holding `agents/a.yaml`, `.local/share/other/keep.md` and the fenced folder `.local/share/halonic` with `trust/x.json` in it,
  when the root is listed,
  then the list is `.local/share/other/keep.md` and `agents/a.yaml`, and reading, writing or removing `.local/share/halonic/trust/x.json` throws a `RangeError`.
- Given the fenced folder `.local/share/halonic` that doesn't exist yet,
  when `.local/share/halonic/unfenced-runs/x` is written,
  then the write throws a `RangeError` and nothing is made.
- Given the fenced folder `profile`,
  when `PROFILE/trust/x.json` is written,
  then the write throws a `RangeError`, on every file system, as the shell's `Fence` refuses it.
- Given a store whose root is a link to the folder that holds the fenced folder `profile`,
  when `profile/trust/x.json` is written,
  then the write throws a `RangeError`.
- Given a root inside the fenced folder,
  when the root is listed or any file read,
  then it throws a `RangeError`.
- Given a sibling folder `profile-old` next to the fenced folder `profile`,
  when `profile-old/a.md` is written,
  then the write goes through.
