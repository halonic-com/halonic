# shell.overview.search

- Status: active
- Since: 0.1.0
- Source: HAL-10 migration checklist U5 (Now); HAL-1303 (T10, P1)

When the user types in an overview page's search field, the overview page shall show only the items whose name, id, description or detail line contains the text, ignoring case, and hide hub sections without a match.

## Examples

- Given agents "Mail triage" in hub "acme" and "Billing" in hub "beta",
  when the user types "TRIAGE" in "Search for agents",
  then only "Mail triage" shows and the "beta" section hides.
- Given text in the search field,
  when the user presses Esc in it,
  then the field clears and every item shows again.
