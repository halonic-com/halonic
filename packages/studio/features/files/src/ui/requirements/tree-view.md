# files.ui.tree-view

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 3.3 (new, accessibility); req-files (HAL-110); HAL-1293; component specs 24.6

The Files view shall show the file tree as an ARIA tree with one Tab stop, show a long name cut in the middle with the full name as the row's title, draw the error count, the warning count and the "not saved" mark on each row, and show a loading state, a can't-load state with "Try again", and an empty state in place of the tree.

## Examples

- Given the workspace has `hubs/p/hub.yaml` and `models.yaml`, when the view shows, then the tree has the label "Files", only one row is in the Tab order, and "hubs" is closed.
- Given the user clicks "hubs", then it opens and its row says it is expanded; clicking it again closes it.
- Given `hubs/p/hub.yaml` has 2 errors, then the closed "hubs" row says "2 errors" to a screen reader.
- Given the file list is still loading, then three or more grey bars show and nothing else.
- Given the folder can't be read, then the view reads "Couldn't load files" with the reason and "Try again"; after "Try again" works, the tree shows.
- Given the workspace has no files, then the view reads "No files yet".
- Given a file changes while the view shows, then the tree shows the new list and keeps the opened folders.
