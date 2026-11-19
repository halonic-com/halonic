# workspace.served-picker

- Status: active
- Since: unreleased
- Source: flow-workspace 2.5 (revision 6), microcopy 4.2, component specs 15.2 and 15.3, first-run-flow 10.2 R11; HAL-1291, HAL-9489, HAL-13571

When the served Studio runs on a phone, the workspace row at the top of More shall show the workspace the computer serves, as `GET /api/workspace` answers it, and shall open a picker sheet when pressed. The sheet shall ask the computer again each time it opens and show the one workspace, with the Demo tag when it is the sample, and under it the line "To open another workspace, open it on your computer." While it asks, it shall say "Loading workspaces". When the computer doesn't answer, it shall say "Couldn't load workspaces" and "Halonic on your computer isn't answering." with **Try again**, which asks again. When the computer didn't answer before the window opened, the More page shall have no workspace row.

## Examples

- Given the computer serves "Acme" in `~/Projects/acme`, then More shows "Acme" over `~/Projects/acme`, and pressing it opens a sheet with that row and the line about opening another workspace.
- Given the served workspace is the sample, then the sheet's row has the Demo tag.
- Given the computer doesn't answer when the sheet opens, then the sheet says it couldn't load, and Try again asks once more and shows the row when the computer answers.
- Given the computer didn't answer at start, then More has no workspace row.
