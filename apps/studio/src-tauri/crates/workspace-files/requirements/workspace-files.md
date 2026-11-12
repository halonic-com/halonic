# studio.src-tauri.crates.workspace-files.workspace-files

- Status: draft
- Since: 0.1.0
- Source: HAL-5761 (the Rust file commands of the `fs-tauri` `DefinitionStore`, HAL-3335); `ports.workspace-path-checks` and `fs-node`'s `FolderDefinitionStore`, which it matches; the profile kept out of a workspace, decided by Liam on HAL-7039

The shell's workspace files shall refuse every path `checkPublicWorkspacePath` in `@halonicjs/ports` refuses, as unsafe or private alike, and shall pass every case in `packages/core/ports/src/golden/workspace-paths.json`. They shall never list, read, write or remove through a symbolic link or a junction in any segment of a path, and shall refuse such a path as private. A list shall give every file under the folder asked for, recursively, relative to the workspace and in UTF-16 code-unit order, leaving out private entries, links, temporary write files (`.halonic-write-<uuid>.tmp`) and everything under them; a folder that isn't there gives no files, and a folder the account may not read shall be refused as `folder_unreadable` naming its workspace path. A read shall give `null` where no file is, and refuse a file that isn't UTF-8 as `not_text`. A write shall create the folders it needs, write a temporary file next to the file, flush it and rename it over the file, keeping a replaced file's permissions. With `expected`, the check and the write shall happen in one turn on the file, so of two writes expecting the same text only one is written and the other is told `changed-on-disk` with the file's text now. A remove of a file that isn't there shall succeed.

The shell's workspace files shall never list, read, write, remove or watch the profile or anything in it, even when the workspace holds it, as when the home folder is opened. They shall refuse such a path as `private_path` and leave the profile out of lists and watches, and shall refuse every path of a workspace that is the profile or inside it. The profile's real path shall be compared as far as it exists, so a profile not made yet and a profile named through a link are kept out too, and its names shall be compared as a file system that folds case may open them. The shell's own calls on a workspace's review folder in the profile are not workspace calls and are unaffected.

## Examples

- Given `hubs/a/hub.yaml`, `.git/config` and a temporary write file in `hubs`,
  when the workspace is listed,
  then the list is `hubs/a/hub.yaml`.
- Given `linked`, a link to a folder outside the workspace,
  when `linked/secret.yaml` is read, written or removed,
  then it is refused as `private_path` and nothing outside changes.
- Given `a.yaml` holding `one`,
  when eight writes expecting `one` run at once,
  then one is written and seven are told `changed-on-disk`.
- Given the folder `hubs/locked` the account may not read,
  when the workspace is listed,
  then it is refused as `folder_unreadable` with the path `hubs/locked`.
- Given the home folder opened as the workspace, with the profile at `.local/share/halonic`,
  when the page writes `.local/share/halonic/studio/picked-folders.json`, or the same path as `.local/share/HALONIC/…`,
  then it is refused as `private_path`, the file is unchanged, and a list of the workspace leaves the profile out.
