# Decision: Changes counts items, not files

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11333 (item 8 of the UX check, Part C, HAL-10839: the checklist counts items, and the files of one item count once)
- Kind: user-visible

The sidebar's Changes count, "Changes, 3 changes", now counts items. The files of one item (a skill's
folder) count once, and a file that no kind places, such as `models.yaml` or a README, counts as one.
The sentence in `source-control.changes-page` says so; nothing else in it changes and no test was weakened.

## Covers

- source-control.changes-page
