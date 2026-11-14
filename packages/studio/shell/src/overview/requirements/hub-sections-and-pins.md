# shell.overview.hub-sections-and-pins

- Status: active
- Since: 0.1.0
- Source: HAL-10 migration checklist U5 (Now); HAL-1303 (T10, P1)

While the "All" filter is selected, the overview page shall show one section per hub, even an empty one, followed by a section "Shared in <workspace name>" when there are shared items, with pinned items first in each section.

## Examples

- Given workspace "Acme" with hubs "acme" (skills "summarise", "draft-reply" with "summarise" pinned) and "beta" (no skills), and one shared skill "tone",
  when the Skills overview shows under "All",
  then it shows section "acme" with "summarise" before "draft-reply", an empty section "beta", and "Shared in Acme" with "tone".
