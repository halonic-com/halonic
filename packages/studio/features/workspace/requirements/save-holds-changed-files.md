# workspace.save-holds-changed-files

- Status: active
- Since: 0.1.0
- Source: save model 1.5, 1.6 and 1.7; flow-files 4.6; HAL-10534, HAL-11169

When a save leaves files alone because they changed outside Halonic, the workspace shall treat it as no failed save: it shall show no failed note and no error toast, tell the host which files were held, and leave them unsaved, so closing the workspace still asks.

## Examples

- Given a save wrote `b.md` and held `a.md`, then no error toast shows and the host is told `a.md` was held.
- Given a file is held, when the user closes the workspace, then the workspace stays open and asks.
- Given a save fails for another reason, then the failed note and its toast show as before.
