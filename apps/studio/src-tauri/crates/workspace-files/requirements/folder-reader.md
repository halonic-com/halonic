# studio.src-tauri.crates.workspace-files.folder-reader

- Status: draft
- Since: 0.1.0
- Source: HAL-8144 (T3 trust, HAL-1291); `ports.folder-reader`, `contracts.folder-reader` and `fs-node`'s `FileSystemFolderReader`, which it matches

The shell's folder reader shall list every entry under a workspace folder, recursively unless told otherwise, with its kind (file, folder, link or other) and a file's size, in UTF-16 code-unit order; read a file's exact bytes; and give an entry's real location. It shall hide no name: `.git`, `.env` and temporary write files are listed and read like any other. It shall never follow a link: a link is listed as a link, and a path through one is refused. It shall never open a special file, and shall refuse it. It shall refuse every unsafe path in every method, as `checkWorkspacePath` in `@halonicjs/ports` does, and shall never list, read or locate the profile or anything in it. A name that isn't a valid path shall fail the listing rather than be left out.

## Examples

- Given `.git/config`, `.env` and `a.txt`,
  when the folder is listed,
  then all three are in the list, and `.env` reads as its bytes.
- Given `acme/latest`, a link to a folder,
  when `acme` is listed,
  then `acme/latest` is a `link`, and listing or reading under it is refused.
- Given a list with a limit of 2 over four files,
  when it runs,
  then it gives three entries.
