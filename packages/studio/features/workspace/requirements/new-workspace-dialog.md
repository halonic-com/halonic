# workspace.new-workspace-dialog

- Status: active
- Since: 0.1.0
- Source: flow-workspace 2.3, microcopy 4.1, states-flow-map (HAL-5878); HAL-1291, HAL-8714

The New workspace dialog shall ask for a name and show the folder it makes, `<parent>/<name>`, with **Change…** picking another parent. While Name is empty, **Create** shall stay pressable and show "Give it a name.". It shall read **Create here**, with "This folder isn't empty. Halonic adds only missing files, and adds .env lines to a .gitignore that lacks them. Nothing else changes.", when the folder holds files, and **Open it**, with "This folder is already a workspace.", when it holds a `workspace.yaml`. **Create** shall call the app's `create` (`createWorkspace` and the trust record) and give the result to the window. If writing fails, then the dialog shall stay open and show "Can't write to this folder: <reason>." under the folder line.

## Examples

- Given Name is empty, when **Create** is pressed, then the field says "Give it a name." and nothing is created.
- Given the parent `~/Documents` and the name `Acme Support`, when **Create** is pressed, then the app creates `~/Documents/Acme Support`.
- Given the folder holds a `notes.txt`, then the button reads **Create here**.
- Given the folder holds a `workspace.yaml`, when **Open it** is pressed, then the window opens that folder and nothing is written.
- Given the write fails with "you don't have permission", then the dialog stays open and says "Can't write to this folder: you don't have permission."
- Given the files were written but the trust record wasn't saved, then the toast reads "Created Acme Support. Couldn't save trust: <reason>."
