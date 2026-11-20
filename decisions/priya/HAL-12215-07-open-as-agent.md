# Decision: the file tab's ⋮ menu starts with Open as agent, workflow or routine

- Task: HAL-12215
- Approval: Liam approves this change on HAL-12215, for HAL-12215. Liam decided to add Open as agent to the tab's ⋮ for 0.1 on HAL-12215; it is flow 4.2 of the approved files flow, so there is no board card.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DqC0qqSRO9RbWktOpqPwLkRhOu7bG5cOGIjzkbSWkH9vIT3LhJX52l7E+KBVVAMkGXVXnQSqy+kHACPemBm6Ag==

## What changes

For a file that defines an agent, a workflow or a routine, the ⋮ menu in the head of its tab starts with **Open as agent** (or **Open as workflow**, **Open as routine**). It opens that item's page as the window opens a found item. Other files show the menu as before: Rename, Copy path and Delete.

The requirement `files.ui.file-tab-header` gets the sentence and an example, and the example has a test. No test was weakened or skipped.

## Why

Files flow 4.2 lets the user go from a definition file to the item it defines. The tree's file menu already offers it; the tab's menu left it out (F1 of the Studio check HAL-12213).

## Covers

- files.ui.file-tab-header
