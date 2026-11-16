# source-control.changes-phone

- Status: active
- Since: 0.1.0
- Source: HAL-1302 (T9), HAL-10667; ux-checklists-t8-t9 (HAL-1360) part 2, 2.12 and 2.14 (T9-F8 to F13); design-phone (HAL-552) 5.1, 5.3, 5.7

When the screen is a phone, the Changes page shall be the same page in one column with a 16px inset. The top bar says "Changes", so the page's heading shall be for screen readers only. Create version shall be a secondary, full-width, 48px button under "Since your last version" and its count, shown only while something has changed. Create version shall open as a full-screen form sheet. Where the page names git, it shall say "your computer", because git runs there: "Halonic needs git on your computer to keep versions." and, when git doesn't answer, "Halonic on your computer isn't answering." as the reason under "Couldn't load changes", with Try again.

On a phone, the sharing strip shall say "Only on your computer." with the hint "Add where to share on a computer." and no action, Get updates shall be a 48px button at the end of the header, History's Show more shall be a full-width 48px button, and its Try again a 48px button.

While their phone layouts are not built, the item rows, What changed and the version page shall follow the desktop pages.

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
  then Show more is a full-width touch button.
- Given a phone and git that doesn't answer,
  then the page says "Couldn't load changes", "Halonic on your computer isn't answering." and Try again.
