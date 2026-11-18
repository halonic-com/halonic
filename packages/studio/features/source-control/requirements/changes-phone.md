# source-control.changes-phone

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9), HAL-10667; ux-checklists-t8-t9 (HAL-1360) part 2, 2.12 and 2.14 (T9-F8 to F13); design-phone (HAL-552) 5.1, 5.3, 5.7

When the screen is a phone, the Changes page shall be the same page in one column with a 16px inset. The top bar says "Changes", so the page's heading shall be for screen readers only. Create version shall be a secondary, full-width, 48px button under "Since your last version" and its count, shown only while something has changed. Create version shall open as a full-screen form sheet. Where the page names git, it shall say "your computer", because git runs there: "Halonic needs git on your computer to keep versions." and, when git doesn't answer, "Halonic on your computer isn't answering." as the reason under "Couldn't load changes", with Try again.

On a phone, the sharing strip shall say "Only on your computer." with the hint "Add where to share on a computer." and no action, Get updates shall be a 48px button at the end of the header, History shall show the newest 5 versions and then a full-width 48px row, See all history, that shows the rest, History's Show more shall be a full-width 48px button after that, and its Try again a 48px button.

When See all history is pressed, the Changes page shall move focus to the first version it shows that was hidden before.

On a phone, an item row shall have its ⋮ in the row's padding and no chevron.

When the screen is a phone, a version in History shall open as its own page in place of the Changes page, with Back to History, the version's name as the page's heading, who made it and when, its notes and what's in it. When Back to History is pressed, the Changes page shall put focus on that version's row and shall show all of History when the row is past the newest 5. When a later read no longer has the open version, the Changes page shall show again and shall stay when a still later read has the version back.

When the screen is a phone and Get updates opens the choices, they shall open as their own page in place of the Changes page, with Back to Changes, "Getting updates" as the page's heading (with focus), and each item's tiles stacked with Yours first. The bottom bar shall hold "Choose for 1 more item." while an item is not chosen, Finish getting updates, unavailable with that line as its reason, and Cancel getting updates. When Back to Changes is pressed, the merge shall stay started, the Changes page shall show "You're in the middle of getting Sam's updates." with Continue and shall put focus on its heading, and Continue shall bring the choices back as they were left.

## Examples

- Given a phone and one changed file,
  then the heading "Changes" is for screen readers only and Create version is a full-width button, and pressing it opens the form sheet.
- Given a phone and no changed file,
  then the page says "Nothing has changed since your last version." and has no Create version.
- Given a phone and a computer without git,
  then the page says "Halonic needs git on your computer to keep versions.".
- Given a phone and a folder with no share address,
  then the strip says "Only on your computer." and "Add where to share on a computer." and has no Add where to share.
- Given a phone and 25 versions,
  then History shows the newest 5 and See all history, and after pressing it Show more is a full-width touch button.
- Given a phone and 25 versions,
  when See all history is pressed,
  then focus is on the 6th newest version.
- Given a phone and 5 versions,
  then History shows all 5 and no See all history.
- Given a phone and git that doesn't answer,
  then the page says "Couldn't load changes", "Halonic on your computer isn't answering." and Try again.
- Given a phone and 3 versions,
  when the person opens "Version 2",
  then the page's heading is "Version 2" and has focus, the page says who made it, its notes and its items, and Back to History puts focus on its row.
- Given a phone and 25 versions, with See all history pressed,
  when the person opens "Version 18" and goes back,
  then History shows all versions and "Version 18" has focus.
- Given a phone with "Version 2" open,
  when a later read no longer has it and a still later read has it back,
  then the Changes page shows and stays.
- Given a phone and both sides changed 2 items,
  when the person presses Get updates,
  then "Getting updates" is the page's heading with focus, Yours is the first tile of each item, and the bottom bar says "Choose for 2 more items." with Finish getting updates unavailable and Cancel getting updates.
- Given a phone with the choices open and one item chosen,
  when the person presses Back to Changes,
  then the merge is not cancelled, the page says "You're in the middle of getting Sam's updates." with focus on its heading, and Continue shows the choice again.
