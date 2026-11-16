# library.library-delete

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (P9a); flow-library 4

Deleting a Library item, from a row's ⋮ menu or an open item page's ⋮ menu, shall move it to the trash with no dialog. A skill takes its whole folder; the other kinds take their one file. The delete is one change that shows in Changes and goes to the trash when saved. A row's delete shall say "Moved <name> to the trash" in a toast with Undo and, when the item is used, a second line naming who uses it (the hubs that take a shared item are named here, unlike in the row). An open item page shall say the same in a strip with Undo where "isn't in this workspace any more" would stand, and that state shall still show for an item that went some other way. Undo shall put the item back; a delete or an Undo that can't be done shall say so with the reason of a kinded error only.

## Examples

- Given the skill "Tone" used by the agent "Support",
  when the user picks Delete in its row's menu,
  then the toast says "Moved Tone to the trash" and "Used by Support", and Undo brings the skill back.
- Given the collection "Claims" is open on its page,
  when the user picks Delete in the page's menu,
  then the page says "Moved Claims to the trash" with Undo and not "isn't in this workspace any more".
- Given a skill that nobody uses,
  when it is deleted from its row,
  then the toast has no second line.
- Given the item is already gone,
  when Delete is picked,
  then nothing changes and a toast says "Couldn't delete <name>" with the reason.
