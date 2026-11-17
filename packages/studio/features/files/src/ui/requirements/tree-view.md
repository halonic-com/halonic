# files.ui.tree-view

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 3.3 (new, accessibility); req-files (HAL-110); HAL-1293; component specs 24.6; HAL-11383

The Files view shall show the file tree as an ARIA tree with one Tab stop, show a long name cut in the middle with the full name as the row's title, draw the error count, the warning count and the "not saved" mark on each row, each with a glyph so no state rests on colour alone (✕ errors, △ warnings, ✎ not saved), show warnings only on a row that has no errors, name a folder row that has marks as "*name*, folder, a file inside not saved, 3 errors", and show a loading state, a can't-load state with "Try again", and an empty state in place of the tree.

## Examples

- Given the workspace has `hubs/p/hub.yaml` and `models.yaml`, when the view shows, then the tree has the label "Files", only one row is in the Tab order, and "hubs" is closed.
- Given the user clicks "hubs", then it opens and its row says it is expanded; clicking it again closes it.
- Given `hubs/p/hub.yaml` has 2 errors, then the closed "hubs" row says "2 errors" to a screen reader.
- Given a file has 2 errors and 1 warning, then its row shows "✕ 2" and no warning; given it has only the warning, the row shows "△ 1"; given it isn't saved, the row shows "✎".
- Given the folder `agents` holds a file that isn't saved and has 3 errors, then its row is named "agents, folder, a file inside not saved, 3 errors" for a screen reader.
- Given the file list is still loading, then three or more grey bars show and nothing else.
- Given the folder can't be read, then the view reads "Couldn't load files" with the reason and "Try again"; after "Try again" works, the tree shows.
- Given the workspace has no files, then the view reads "Everything in this workspace is a file." with "Add one with +." and no button: the **+** button is the way in (HAL-11190, HAL-11624). A workspace with `workspace.yaml` as its only file keeps that row and shows the same two sentences as a quiet line under it.
- Given a file changes while the view shows, then the tree shows the new list and keeps the opened folders.
