# Decision: the name field's reason is read out, wraps, and takes the heading's type

- Task: HAL-12216
- Approval: C434 RN1 to RN3 (HAL-14607), decided by the designer on the approved screen (HAL-2282); Liam approves this note in review
- Kind: user-visible

## What changes

- `shell.item-page-header`: where a page checks names, the reason a name can't be kept now shows once the typing pauses, not on every key. It is read out once through the window's announcer, because a screen reader doesn't read a description again when it changes under focus. Enter on that name shows the reason at once if it isn't shown yet and reads it again. Leaving the field puts the old name back, as before, and now announces "Name not changed: <the reason>".
- The reason's line wraps before the window's edge, instead of running off it at 200 % zoom.
- The name field takes its type from the heading it sits in. `ItemHeader`'s `h1` now carries `text-section`, so item pages look the same. The Workflows, Routines and Library collection pages, whose `h1` is `text-title`, get their title's size back.

Nothing is removed or weakened: the reason is still the field's description, and Enter and leaving the field keep and refuse the same names. An example for the announcements is added to the requirement, and tests for them to `name-field.test.tsx`.

## Why

Noah's check C434 of the rename on `main` found that a person using a screen reader never hears why a name was refused (RN1, medium), that a long reason runs off the window at 200 % (RN2), and that the field made the Workflows page's title shrink from 28 px to 15 px, so the heading's focus ring no longer fits the text (RN3). The fixes, decided by the designer, are in the shell's `NameField`, so every page with a name field gets them.

## Covers

- shell.item-page-header
