# Decision: on a phone, a workflow's Last run gets a line of its own

- Task: HAL-13100
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13100 (Sofia's team decision on the approved Workflows list, HAL-2282 rule, no new words; Liam approves this note in review on the task)
- Kind: user-visible

## What changes

On a phone, a row's used-by text ends the line under its name, after the description and " · "
(HAL-12858), and when that line is too long the description is cut and the used-by text stays whole
(HAL-13066). A workflow's used-by text is its Last run, "Last run ✕ Today 03:17", which is long: at
320 px it leaves the description one letter, "A… · Last run ✕ Today 03:17".

The requirement `shell.overview.used-by` now also says that an item can ask for its used-by text on
a line of its own under the description, each line cut only by its own length. The Workflows rows
ask for it when a workflow has a Last run. Library, Agents and every desktop row don't change.

Nothing is removed or weakened: the existing examples and their tests stay as they are, and a new
example with its test covers the own line.

## Why

Sofia's decision on C131 WL1: the name and the description get the row's full width, and Last run
reads whole on its own line, as the Runs rows already do (HAL-12829). A short used-by text such as
"Not used yet" still fits at the end of the description's line, so the other lists keep one line.

## Covers

- shell.overview.used-by
