# files.ui.file-tab-header

- Status: active
- Since: unreleased
- Source: HAL-12215 (F1 of the Studio check HAL-12213); files flow 4.2 and 6.1; UX checklist 8.5 and 8.11

The head of a file's tab shall show the file's name, then its folder in muted text, then a ⋮ menu named "More actions for *name*" with **Rename**, **Copy path** and **Delete**. **Rename** and F2 anywhere in the tab shall ask the tree to edit the file's name in its row, and show the Files view on the sidebar's switch (`shell.sidebar-view-request`) so the user sees the row. **Copy path** shall put the path on the clipboard and say "Copied *path*". **Delete** shall delete the file as the Delete key does. A file at the top of the workspace shows no folder.

## Examples

- Given `hubs/p/agents/a.agent.yaml` is open, then the head reads `a.agent.yaml` and, in muted text, `hubs/p/agents`.
- Given `models.yaml` is open, then the head shows no folder.
- Given the user opens the ⋮ menu, then it lists Rename, Copy path and Delete.
- Given the user picks Rename, or presses F2 in the editor, then the file's row in the tree shows its name field.
- Given the sidebar shows Studio, when the user picks Rename, then the sidebar shows Files and the row's name field.
- Given the user picks Copy path, then the clipboard holds `hubs/p/agents/a.agent.yaml` and the toast reads "Copied hubs/p/agents/a.agent.yaml".
- Given the user picks Delete, then the file is deleted and the tab shows "This file was deleted" with Undo.
