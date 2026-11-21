---
"@halonicjs/studio-kit": minor
"@halonicjs/app-studio": patch
---

Renaming on a phone now reads an empty name's error while Name has the focus, and the top bar and window title take the new name; a renamed routine or Library item also renames its desktop tabs. A long title in the phone's top bar wraps to two lines before it is cut. The kit's `FilterChips` takes `flush`, which drops the row's 16px sides, so a collection's chips line up with its title and grid. In the Inbox, a screen reader reads Next as "Next: title, 1 left", without a stray space before the comma.
