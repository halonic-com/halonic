# files.tree.reveal-request

- Status: draft
- Since: unreleased
- Source: HAL-12227 (Library's "Open the docs folder"); plan approved on HAL-12255; answer from HAL-13066

The Files `api.ts` shall offer `requestFilesReveal(path)`, with which another feature asks the file tree to show a path. The path is read from the workspace folder; the request shall drop `.` and empty segments, and an absolute path, a drive, or a path with a `..` segment shall ask for nothing. A request made before the tree is listed shall wait until it is, the latest request shall win, and the tree shall take it once. The tree shall then open the folders down to the path's row and focus it; for a folder, it shall open that folder too. The tree lists only folders that hold files, so when the path isn't in the tree, the tree shall show the deepest folder on the path that is, and when not even the top folder is, the tree's first row, opening nothing. A request shall create nothing and write nothing. `requestFilesReveal` shall answer once the tree takes the request: `shown` when the path's own row has the focus, `nearest` when the tree showed another row, and `dropped` for a path outside the workspace folder or a request a later one replaced.

## Examples

- Given the tree lists `hubs/sales/docs/guide.md`,
  when a feature asks for `hubs/sales/docs` before the tree is listed,
  then once listed, "hubs", "sales" and "docs" are open, "guide.md" shows, and "docs" has the focus.
- Given the tree lists `hubs/reports/hub.yaml` and no `hubs/reports/docs`,
  when a feature asks for `hubs/reports/docs`,
  then "hubs" and "reports" are open, "reports" has the focus, and the answer is `nearest`.
- Given no `notes` folder, when a feature asks for `notes/a/b`,
  then no folder opens and the tree's first row has the focus.
- Given a feature asks for `/etc`, `C:work` or `hubs/../../x`,
  then the tree takes no request.
- Given a feature asks for `hubs/reports`, then `hubs/sales`, before the tree is listed,
  then the tree shows `hubs/sales` only.
