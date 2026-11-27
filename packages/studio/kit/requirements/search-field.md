# kit.search-field

- Status: active
- Since: unreleased
- Source: HAL-20675; build plan P2 on HAL-20617, Noah's part recipes (HAL-20672), the list panel's search

The kit's `SearchField` shall be a `type="search"` text field named by its `label`, which the empty field also shows, on a round `surface-muted` pill with no edge, 40px high and 48px on a phone, with the 20px search glass in `fg-subtle` 16px from its start, hidden from screen readers, the text 12px after the glass in `text-body`, and 8px after the text. While its text has keyboard focus, the pill shall turn `surface` with a 2px `accent` ring inside its edge. In forced colours it shall keep a 1px edge. A press anywhere on the pill shall put the caret in its text.

## Examples

- Given `<SearchField label="Search chats" />`,
  when it renders,
  then there is one search field named "Search chats" that shows "Search chats" while empty, on a 40px round `surface-muted` pill.
- Given a SearchField,
  when the person presses on the glass,
  then the caret goes into its text.
