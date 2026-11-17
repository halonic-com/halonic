# app.change-file-lines

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); req-source-control (HAL-110) revision 4, `source-control.changes.discard-per-change`; Changes design 8

The `describeFileChange` function shall give what changed in one workspace file from its two texts: it takes the kind from where the file sits, reads both texts as that kind and gives the lines `describeItemChange` gives, Important ones first. A file no kind places, a text that doesn't read as the kind, or an item whose texts differ only in comments or spacing shall give one line without parts, "New", "Deleted" or "Changed", and the result shall say its lines were not described from the item's contents.

## Examples

- Given `agents/triage.agent.yaml` changed its model and its instructions, then the instructions line comes first, marked important, and the model line second, each with its part.
- Given `README.md` changed, then its one line is "Changed" without parts, and it is not described.
- Given an agent file that no longer reads as YAML after an edit, then its one line is "Changed" without parts.
- Given a new `workflows/report.workflow.yaml`, then its line is "New".
