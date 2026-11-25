# studio.desktop-search-overview

- Status: active
- Since: unreleased
- Source: HAL-18879 (click test steps 6 and 7, HAL-18354; the board's phase 1 list on HAL-17897)

The desktop app shall let the person reach Search and the overview: Ctrl K shall search the connected sources' agents, inbox items and work, such as a Paperclip's tasks (requirement `search.palette`), and the sidebar shall list the Overview place under its Team heading, which shows the recap and the overview (requirement `overview.place`).

## Examples

- Given the desktop app,
  when its search providers are listed,
  then the Search feature's provider is one of them.
- Given the desktop app,
  when the sidebar lists its places,
  then Overview is one of them, under the heading "Team".
