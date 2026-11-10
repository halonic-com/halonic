# Decision: the shell names the sidebar's places, and nothing shows for a zero signal

- Requirement: `shell.sidebar-places` (`packages/studio/shell/requirements/sidebar-places.md`)
- Task: HAL-3063 (item 5), from Sofia's UX check of #866 on HAL-3034
- Approval: Liam decided the change on [HAL-3034](/HAL/issues/HAL-3034) and confirmed it as the API decision on [HAL-3063](/HAL/issues/HAL-3063); he approves this note in review
- Kind: internal

## What changes

A feature that adds a place no longer gives its name or icon. `PlaceContribution` keeps only `id`,
the view and `signal`. The shell holds one table, `placeNames`, with the name and outline icon of
each of the 8 places, and `showPlace` gives what the sidebar shows: the name, the icon and the
signal, with no signal and nothing added to the spoken name when the value is zero.

When two features add the same place, the error now says that each place belongs to one feature,
instead of the generic "rename one", because a place can't be renamed.

The requirement gains the sentence about the shell's names and the zero signal, and two examples:
a count of 0 for the Inbox, and two features adding Agents. The "only Home" example says "only
Home is added", because the shell doesn't add Home itself until the Home pull request.

## Why

The place names are fixed words from the component specs (24.4) and the glossary, and the same
words appear in the sidebar, the phone's bar and More page, a tab's title and the palette. If each
feature named its own place, a feature could call Agents "Crew". No feature registers a place yet,
so changing the public interface now costs nothing.

## Tests

No test was weakened or removed. Tests were added for the name table, the "only Home" example, a
signal above zero, a signal of zero and the new duplicate message.

## Covers

- shell.sidebar-places
