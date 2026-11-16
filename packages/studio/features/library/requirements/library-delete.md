# library.library-delete

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (P9a); flow-library 4

Deleting a Library item, from a row's ⋮ menu or an open item page's ⋮ menu, shall move it to the trash with no dialog. A skill takes its whole folder; the other kinds take their one file. The delete is one change that shows in Changes and goes to the trash when saved. A row's delete shall say "Moved <name> to the trash" in a toast with Undo; when agents use the item, the title ends with a full stop and a second line says how many show an error until the item is taken off their Tools page (microcopy 11.3). The other users of an item have no line until the design gives one. An open item page shall say "This <kind> was moved to the trash" in a strip with Undo where "isn't in this workspace any more" would stand, and that state shall still show for an item that went some other way. Undo shall put the item back only while the delete is still the newest step; otherwise it shall undo nothing and say so. A delete that can't be done shall say "Couldn't move <name> to the trash: <reason>." in a danger toast that stays, with Try again, and shall give the reason of a kinded error only. A successful Undo says nothing: the restored row or page is the feedback.

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
- Given the item is already gone,
  when Delete is picked,
  then nothing changes and a toast says "Couldn't move <name> to the trash: <reason>." with Try again.
- Given a skill was deleted and then another file was edited,
  when the toast's Undo is pressed,
  then nothing is undone and a toast says the skill can't be put back.
