# studio.src-tauri.crates.workspace-files.folder-reader

- Status: draft
- Since: unreleased
- Source: HAL-8144 (T3 trust, HAL-1291); `ports.folder-reader`, `contracts.folder-reader` and `fs-node`'s `FileSystemFolderReader`, which it matches

The shell's folder reader shall list every entry under a workspace folder, recursively unless told otherwise, with its kind (file, folder, link or other) and a file's size, in UTF-16 code-unit order; read a file's exact bytes; and give an entry's real location. It shall hide no name: `.git`, `.env` and temporary write files are listed and read like any other. It shall never follow a link: a link is listed as a link, and a path through one is refused. It shall never open a special file, and shall refuse it. It shall refuse every unsafe path in every method, as `checkWorkspacePath` in `@halonicjs/ports` does, and shall never list, read or locate the profile or anything in it. A name that isn't a valid path shall fail the listing rather than be left out. On Windows it shall refuse a path with a `:` in any segment, a drive or a stream, and, while the profile is inside the folder, a segment with a `~` followed by a digit, which may be the profile's short name; every path shall be checked to stay in the folder once it is joined to it. It shall refuse to read a file larger than 64 MiB, and a listing shall fail rather than step into a folder more than 100 folders deep.

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
- Given a file of 64 MiB and one byte,
  when it is read,
  then the read is refused and nothing of it is read.
- Given `C:/Windows/win.ini` on Windows,
  when it is read,
  then it is refused as `unsafe_path`.
