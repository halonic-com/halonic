# studio.src-tauri.crates.workspace-files.folder-poll

- Status: draft
- Since: unreleased
- Source: HAL-5761 (`fs_watch`, the watch of the `fs-tauri` `DefinitionStore`, HAL-3335), HAL-11253 (one look per folder, the file limit)

The shell's folder watch shall look at the workspace's files, with their size and modified time, once when it starts and then about every second, and shall send the paths that were added, changed or removed since the look before as one batch, leaving out what a list leaves out. A folder that went away shall give each file that was in it. When a look fails, the watch shall send one failure with its reason and stop. A workspace it can't look at when it starts shall be refused. The watches of one folder shall share one look at it, however many pages and parts of a page watch it, and the look shall end with the folder's last watch. A folder with more than 50,000 files shall not be watched: its watch shall send one failure that says the folder has too many files to watch for changes and to open a smaller folder, and stop. Once a stop for a watch returns, that watch shall send nothing more, and only the page that started a watch shall stop it; every watch of a page shall stop when the page reloads or closes.

## Examples

- Given a watch on a workspace with `hubs/a/hub.yaml`,
  when the folder `hubs` is removed,
  then the next batch is `hubs/a/hub.yaml`.
- Given a watch whose next look fails because `hubs` can't be read,
  when it looks,
  then it sends one failure naming `hubs` and stops.
- Given a watch the page `main` started,
  when another page asks to stop it,
  then it keeps running; when `main` asks, it stops and sends nothing more.
- Given three watches on the folder `acme`, from three parts of the page,
  when a file in it changes,
  then the folder is looked at once per look, each watch gets the batch, and the look ends when the last of them stops.
- Given a watch on a folder with more than 50,000 files,
  when it starts,
  then it sends one failure, "This folder has more than 50,000 files, too many to watch for changes made outside Halonic. Open a smaller folder to see them as they happen.", and stops.
