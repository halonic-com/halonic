# Decision: Library reads the kept name, names records by their text and shows a new collection's name

- Approval: Liam reviewed and approved this change on HAL-14203 (review of halonic#4170, 20 Nov, 13:12 UTC); the words follow how Studio already names things, so the team decides this and it doesn't go to the board; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5lKlwZAWU9AUHAPTAz3ILlpOtb44yNiotVSpQkKOaKGDyV8sYdyLdsPh2q1J56vNV9U8fnjhjp/8wTI+KNUVBg==
- Task: HAL-14203

## What changes

These come from the keyboard and screen-reader check C328 of Library (rows L4 to L8 on the a11y sheet).

- **L4:** `library.skill-page` now says that when an emptied Name or "When to use it" is put back, the
  hint "A skill needs a name, so the old one is kept." (or the "When to use it" one) is read once through
  the window's announcer, since focus has already left the field. One example is added.
- **L5:** `library.collection-page` now says that a record is named by its first field's text, never by
  its generated id, and as "this record" when that is empty. That name is used by the row's menu button
  ("More actions for Swim lesson"), the remove dialog ("Remove Swim lesson?") and the screen-reader lines
  ("Added Trip.", "Removed Swim lesson.", or "Added a record." without a name). The rename field in the
  header is named "Name", as on a skill. Two examples are added.
- **L6:** `library.new-collection` now says that the new collection's tab shows its name ("Claims"), not
  the file's id.
- **L7:** `library.collection-page` now says that each empty cell of the new row is named "New record"
  for a screen reader and is as high as a row with text.
- **L8:** the phone Library list rows use Studio's focus ring. No requirement text changes for this.

No example was removed or weakened.

## Why

A screen reader user didn't hear that an emptied name was put back and would think the field was empty
(WCAG 4.1.3). A generated id like `claims-mwonmx0w-1` means nothing to the person who typed "Sam Jansen",
and a tab showing the file id until the page is reopened looks like a different collection. The empty new
row had no name and a 17 px target. All of the new words follow names Studio already uses ("this record",
"New record", "Name").

## Covers

- library.collection-page
- library.new-collection
- library.skill-page
