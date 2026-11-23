# studio.try-it-changes

- Status: draft
- Since: unreleased
- Source: HAL-16808; flow-assistant 4.4; AI changes 1.5; `app.review-try-it-holds-back`, `agents.chat.try-it-changes-line`, `workflows.tests.try-it-changes`

The Studio app shall give the agents and workflows hosts a watch of one item's changes to review, read from the workspace's review service. It shall ask the review service for the Try it source of the item's file, and count as included the changes to review in that file less those the source leaves out of it; a deleted file counts as one change. It shall count the left-out changes over every file the item's run reads, by reason, and those from before trust apart, with the workspace's name. It shall read them when the watch starts and again each time the review records change, and give the listener only the newest answer. A read that fails shall be reported, and the listener keeps what it last had. After the watch stops, it shall give nothing more.

## Examples

- Given *Sorter*'s file has 3 changes to review and the source leaves 1 of them out for permissions,
  then the watch gives 2 included and 1 left out for permissions.
- Given a skill *Sorter* reads has 2 changes left out for connections,
  then the watch gives 2 left out for connections.
- Given the review records change,
  then the watch reads the changes again and gives them to the listener.
- Given the watch stopped,
  then a read that finishes afterwards gives nothing.
