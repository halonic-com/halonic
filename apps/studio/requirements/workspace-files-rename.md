# studio.workspace-files-rename

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 5; HAL-1293, HAL-10902

The app's files host shall rename a file as one undo step, and when the file is a Library item (a skill, knowledge source, collection or connector) whose new name gives it a new id in the same place, rewrite every place that names the old id (`referencesTo`) to the new one in the same step. A Library file with an `id:` of its own that is its old name shall get the new id in that file too; one whose `id:` is not its name keeps its id and changes no other file. It shall refuse a path the workspace doesn't serve, a folder, a file on the way, a path that already has a file, and the file's own path, and a `SKILL.md` moved to another folder while its folder has other files (the whole folder doesn't move yet). A file that is not a Library item, or a move that keeps the id, shall change no other file. `renameImpact` shall give the number of places that would be rewritten.

## Examples

- Given agent `helper` lists the skill `refunds` and `hubs/support/library/skills/refunds/SKILL.md` is renamed to `hubs/support/library/skills/returns/SKILL.md`, then the agent's `skills` entry reads `returns` and `renameImpact` says 1.
- Given `notes.md` is renamed to `todo.md`, then no other file changes and `renameImpact` says 0.
- Given `workspace.yaml` has a file, when `a.md` is renamed to it, then the host rejects with "workspace.yaml already exists." and changes nothing.
- Given `skills/refunds/` has `SKILL.md` and `script.sh`, when `SKILL.md` is renamed to `skills/returns/SKILL.md`, then the host rejects with "This skill has other files in its folder, so it can't be renamed here yet."
- Given `claims.collection.yaml` has `id: claims`, when it is renamed to `cases.collection.yaml`, then its `id:` reads `cases` and so do the places that name it.
