# shell.found-in-place

- Status: active
- Since: unreleased
- Source: HAL-18879 (click test steps 6 and 7, HAL-18354); search across tasks, feature 14 of the HAL-17422 plan, approved by the board on HAL-10 (24 Nov)

When a search provider's result names a place (`SearchResult.place`), Ctrl K and the Search page shall open that place for it instead of a page of the item's own, and shall still show each such result as its own row. A result that names no place shall open the item's own page as before.

## Examples

- Given a provider finds the Paperclip task "Acme: answer the click test" with the place Overview,
  when the person picks it in Ctrl K,
  then Overview opens.
- Given a provider finds two tasks, both with the place Overview,
  when the person types words both match,
  then Ctrl K shows two rows.
- Given a provider finds the agent "Sorter" with no place,
  when the person picks it,
  then the agent's own page opens.
