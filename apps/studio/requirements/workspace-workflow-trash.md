# studio.workspace-workflow-trash

- Status: draft
- Since: unreleased
- Source: HAL-12216 (T7b, ⋮ and Delete); UX checklist 10.2 Delete; flow-workflows 2.3; microcopy 9.1 Delete; save model 4.3; states K2 (files are changed through the workspace's files, never the engine)

When the Workflows feature deletes a workflow, the desktop app shall take the workflow's file and every test file of its hub that tests it out of the workspace as one undoable change of the workspace's files, and its undo shall be the way back of `studio.undoable-delete`, which puts them back after later changes too; a workflow the hub doesn't have shall be refused with nothing written. For the warning after a delete, the app shall count the routines that start the workflow (a routine that names no hub starts its own hub's) and the steps of the hub's other workflows that run it.

## Examples

- Given acme's `reply` has the test file `reply.test.yaml`, when it is deleted, then both files go in one change labelled "Deleted workflow Reply".
- Given the delete is the newest change, when its undo runs, then both files are back as they were.
- Given another change came after the delete, when its undo runs, then both files are back as they were, as a change labelled "Put back workflow Reply", and the other change stays.
- Given acme has no workflow `gone`, when it is deleted, then the delete fails with "This workflow isn't in this workspace any more." and nothing is written.
- Given acme's routine `hourly` runs `reply`, a workspace routine runs acme's `reply`, a routine of beta runs its own `reply`, and acme's `triage` runs `reply` in two steps, then `reply` is run by 2 routines and 2 steps.
