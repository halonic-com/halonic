# workspace.saves-itself

- Status: active
- Since: unreleased
- Source: save model 1 and 1.6, UX checklist 1.3 (HAL-7872 note 1), flow-workspace 2.4; HAL-1291

When the files of a shown workspace change, the workspace shall save them by itself 1 second after the last change, through the window's save state, so the toolbar says "Saving…" and a failed save shows its toast with **Try again**. When the user closes a workspace, the switcher shall save what is waiting first and close it without asking when that works. When it doesn't, the workspace shall stay open and the window shall ask "Close *name*?", with "Couldn't save *name*: *reason*. Close anyway throws away the changes." and **Cancel** (focused), **Close anyway** and **Try again**. **Cancel** keeps the workspace open, **Try again** saves and closes, asking again if it still fails, and **Close anyway** closes it and throws the changes away, and the dialog says so. When the user closes the window, every open workspace shall save first; a save that throws counts as failed, and one that is still running after 5 seconds shall keep the window open and ask "Close *name*?" with "*name* is still saving." and only **Wait** (focused) and **Close anyway**, with no **Try again** because the save is still running, while the save goes on. If that save works before the user answers, the window shall close by itself. **Close anyway** closes that workspace and throws its changes away, as on a failed save, and the window goes the next time the user closes it. Ctrl Z (⌘ Z on macOS) shall undo the workspace's last change and Ctrl Shift Z redo it, also in a field that shows workspace content (`shell.workspace-content-fields`), which has no undo of its own, except in any other text field, which keeps its own undo.

## Examples

- Given the user changed a file, when 1 second passes with no other change, then the file is saved.
- Given the user changed a file 400 ms ago, when they choose **Close workspace** and the save works, then the workspace closes at once and nothing is asked.
- Given the disk is full, when they choose **Close workspace**, then "Close Acme?" says "Couldn't save Acme: the disk is full. Close anyway throws away the changes." and the workspace stays open until they answer.
- Given a save that is still running 5 seconds after the user closed the window,
  when the limit passes,
  then the window stays open and "Close Acme?" says "Acme is still saving. Close anyway throws away the changes." with **Wait** and **Close anyway** only, and when the save then works, the window closes.
- Given a save that throws when the user closes the window,
  then the window stays open and "Close Acme?" says "Couldn't save Acme." and offers the same three answers.
- Given focus is in a text field that is not workspace content, such as the chat message box, when they press Ctrl Z, then the field undoes its own text and the workspace's history stays.
- Given focus is in a field that shows workspace content, when they press Ctrl Z, then the workspace undoes its last step and the field's own undo does not run.
