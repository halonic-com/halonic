# shell.item-page-name-note

- Status: active
- Since: unreleased
- Source: HAL-18933 (T6 gap 9 on HAL-17270); flow-agents 3.1 "Renaming" (save model 5, revision 26)

Where the page gives the item page's name field a note (`renameNote`), such as what else a rename changes, the shell shall show it under the field while a new name is typed that isn't empty and has no problem, in the place of the problem line and in the kit Field's hint style (`text-caption`, `fg-subtle`), tied to the field as its description. The note shall not be announced as the name is typed. It shall not show for the name the item already has, for an empty name, or while the name has a problem; the problem shows instead.

## Examples

- Given the note "Also updates 3 places: Inbox flow (Sort mail), Morning digest (routine), Weekly report (Draft)",
  when the user types "Mail sorter" in the name field,
  then that line shows under the field as its description, and nothing is announced.
- Given the same note and another workflow called "Mail triage",
  when the user types "Mail triage",
  then the note is gone and, once the typing pauses, the problem shows in its place.
