# studio.workspace-files-rename

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 5; HAL-1293, HAL-10902

The app's files host shall rename a file as one undo step, and when the file is a Library item (a collection, knowledge source, collection or connector) whose new name gives it a new id in the same place, rewrite every place that names the old id (`referencesTo`) to the new one in the same step. It shall refuse a path that already has a file, and the file's own path. A file that is not a Library item, or a move that keeps the id, shall change no other file. `renameImpact` shall give the number of places that would be rewritten.

## Examples

- Given agent `helper` lists the skill `refunds` and `hubs/support/library/skills/refunds/SKILL.md` is renamed to `hubs/support/library/skills/returns/SKILL.md`, then the agent's `skills` entry reads `returns` and `renameImpact` says 1.
- Given `notes.md` is renamed to `todo.md`, then no other file changes and `renameImpact` says 0.
- Given `workspace.yaml` has a file, when `a.md` is renamed to it, then the host rejects with "workspace.yaml already exists." and changes nothing.
