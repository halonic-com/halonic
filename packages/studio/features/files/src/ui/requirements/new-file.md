# files.ui.new-file

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 5 (T5-F8, T5-F9); microcopy 7; HAL-1293; HAL-11383

The Files view shall have a **+** button named "New file" that opens a dialog with one Path field starting with `hubs/`, or with the focused folder, and the cursor at its end. **Create** shall stay pressable; a path with no file name, outside the workspace or in the local data, and a path the host refuses as a path problem (`FilePathError`), such as one that exists, shall show their sentence under the field with the text selected and the dialog open. A write that fails for another reason shall show "Couldn't create *path*: *reason*." in a Callout above the field with **Try again**, which asks the host again and puts focus back in the field; typing in the field clears it. A path that works shall create the file, close the dialog, show the toast "New file *path*" and open the file.

## Examples

- Given the tree has no focused folder, when the user presses "New file", then the Path field reads `hubs/`.
- Given the folder `hubs/p/agents` is focused, when the user presses "New file", then the Path field reads `hubs/p/agents/`.
- Given the path reads `hubs/`, when the user presses Create, then "Give the file a name, like hubs/support/agents/new.agent.yaml." shows under the field, the host is not asked and the dialog stays open.
- Given the path reads `../x.yaml`, then "Files must stay inside the workspace." shows.
- Given the path reads `.studio/x.yaml`, then `".studio/x.yaml" is not part of the workspace definitions` shows.
- Given the host says "workspace.yaml already exists.", then that sentence shows under the field and the dialog stays open.
- Given the host fails to write `hubs/a.yaml` with "The disk is full.", then "Couldn't create hubs/a.yaml: The disk is full." shows in a Callout with **Try again**, nothing shows under the field and the dialog stays open; pressing **Try again** asks the host again.
- Given the path reads `hubs/p/agents/b.agent.yaml` and the host makes it, then the dialog closes, the toast reads "New file hubs/p/agents/b.agent.yaml" and the window opens that file.
