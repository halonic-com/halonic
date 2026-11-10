# studio.src-tauri.crates.git-guard.closed-folders

- Status: draft
- Since: 0.1.0
- Source: HAL-2612; Liam's plan approval on HAL-2652 (change 4: revoking trust closes the folder)

When a folder is closed, as revoking its trust does, the shell shall take that exact folder off the opened folders, after the same canonicalisation as opening it, so that git is refused there from then on without a restart. A folder opened on its own above it shall stay open, with everything inside it. When the folder can no longer be canonicalised, because it was deleted or moved, the shell shall compare it as given, and closing a folder that isn't open shall change nothing. A folder opened as an already checked path shall be closed by that exact path, without canonicalising it again, so that a link swapped in since can't close another folder and leave it open.

## Examples

- Given the opened folder `acme` holding a repository,
  when `acme` is closed and the shell runs `status` there,
  then the call is refused with `folder_not_opened`.
- Given the opened folders `acme` and `beta`,
  when `acme/../acme` is closed,
  then git is refused in `acme` and still runs in `beta`.
- Given the opened folder `acme`, deleted after it was opened,
  when it is closed by the path the shell recorded and a folder `acme` is made again,
  then git is refused there.
- Given the opened folders `acme`, opened as its checked path, and `beta`, and `acme` swapped for a link to `beta`,
  when `acme` is closed by its checked path,
  then git still runs in `beta`, and is refused in a folder `acme` made again.
