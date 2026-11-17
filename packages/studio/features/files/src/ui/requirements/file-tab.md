# files.ui.file-tab

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 3.4 (Save A: no Save button, no unsaved dot); HAL-1293; component specs 24.7

The Files view shall open a file in a tab named by the file's name, show its text in the code editor, send every edit to the workspace's files so they save by themselves, show changes the editor didn't make (the workspace's Undo, a rename), and show a loading state, "This file isn't in this workspace any more." with **Go to Files** for a missing file and "Couldn't open this file" with the reason when it can't be read.

## Examples

- Given the user presses Enter on `hubs/p/hub.yaml` in the tree, then the window opens the item `file/workspace/hubs/p/hub.yaml` and the tab reads `hub.yaml`.
- Given the tab shows `models.yaml`, then its heading reads `models.yaml`, the text is in the editor and the editor's name for a screen reader is "Text of models.yaml".
- Given the user types in the editor, then the workspace's file gets the new text as one undo step for that file, and the tab shows no Save button and no unsaved dot.
- Given the user undoes with the workspace's Undo, or another feature changes the file, then the editor shows the file's new text and the next keystroke builds on it.
- Given the file is still loading, then grey bars show and the editor does not.
- Given the file is gone from the workspace and not in the trash, then the tab reads "This file isn't in this workspace any more." with Go to Files and no editor shows.
- Given the file can't be read, then the tab reads "Couldn't open this file" with the reason.
