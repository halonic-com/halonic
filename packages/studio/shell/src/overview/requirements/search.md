# shell.overview.search

- Status: active
- Since: unreleased
- Source: HAL-10 migration checklist U5 (Now); HAL-1303 (T10, P1)

When the user types in an overview page's search field, the overview page shall show only the items whose name, id, description or detail line contains the text, ignoring case, and hide hub sections without a match. Once the search or the hub chip changes, the page shall read, politely and once it settles, how many items it shows ("1 workflow.", "2 routines."), or the no-match line when it shows none, through the shell's `announceState`; a refresh of the items shall not be read (HAL-14241).

## Examples

- Given agents "Mail triage" in hub "acme" and "Billing" in hub "beta",
  when the user types "TRIAGE" in "Search for agents",
  then only "Mail triage" shows and the "beta" section hides.
- Given text in the search field,
  when the user presses Esc in it,
  then the field clears and every item shows again.
- Given skills "Draft reply" and "Summarise" in "acme" and "Billing" in "beta",
  when the user types "draft", then "zzz", then clears the field,
  then a screen reader hears "1 skill.", then `No skills match "zzz".`, then "3 skills.".
