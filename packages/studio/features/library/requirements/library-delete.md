# library.library-delete

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (P9a); flow-library 4

When the user deletes a Library item, from a row's ⋮ menu or an open item page's ⋮ menu, the Library shall move it to the trash with no dialog. A skill takes its whole folder; the other kinds take their one file. The delete is one change that shows in Changes and goes to the trash when saved. A row's delete shall say "Moved <name> to the trash" in a toast with Undo; when agents use the item, the title ends with a full stop and a second line says how many show an error until the item is taken off their Tools page (microcopy 11.3). The other users of an item have no line until the design gives one. An open item page shall say "This <kind> was moved to the trash" (one phrase, no full stop, no item name: the name is the page's title; with the agents line after it, a full stop first) in a strip with Undo where "isn't in this workspace any more" would stand, and that state shall still show for an item that went some other way. Undo shall put the item back only while the delete is still the newest step; otherwise it shall undo nothing and say so. A delete that can't be done shall say "Couldn't move <name> to the trash: <reason>." in a danger toast that stays, with Try again, and shall give the reason of a kinded error only. A successful Undo says nothing, not even to a screen reader: the restored row or page is the feedback (microcopy 19.7). After a row's delete, focus shall go to the next row in the list, else the previous, else the empty state; after Undo, focus shall be on the restored row.

## Examples

- Given the skill "Tone" used by the agent "Support",
  when the user picks Delete in its row's menu,
  then the toast says "Moved Tone to the trash." and "1 agent now shows an error until you take it off its Tools page.", and Undo brings the skill back.
- Given the collection "Claims" is open on its page,
  when the user picks Delete in the page's menu,
  then the page says "This collection was moved to the trash" with Undo and not "isn't in this workspace any more".
- Given a skill that nobody uses,
  when it is deleted from its row,
  then the toast has no second line.
- Given three rows and the middle one is deleted,
  when the delete is done,
  then focus is on the row that followed it; with the last row deleted it is on the one before, and with the only row deleted it is on the empty state's title. After Undo it is on the restored row.
- Given the item is already gone,
  when Delete is picked,
  then nothing changes and a toast says "Couldn't move <name> to the trash: <reason>." with Try again.
- Given a skill was deleted and then another file was edited,
  when the toast's Undo is pressed,
  then nothing is undone and a toast says the skill can't be put back.
