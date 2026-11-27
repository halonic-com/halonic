# studio-click-test.sidebar-row-size

- Status: active
- Since: unreleased
- Source: Nora's second review of #6818 on HAL-20558 (27 Nov): the click test measures a sidebar row only while the list shows it

When the Inbox step shows the seeded card's row, or the Messenger step shows the seeded agent's chat row, the click test shall read the height the app drew for that row and for its picture's place before it clicks the row, and shall fail the step as `SIDEBAR_ROW_SIZE`, naming both heights, unless the row is 72px and the picture 48px high. Where the row isn't in the list, it shall fail the step as `NO_SIDEBAR_ROW`. Where the row shows initials rather than a picture, it shall read only the row's height.

## Examples

- Given a row drawn 72px high with a 48px picture,
  then the step passes.
- Given a row drawn 96px high with a 48px picture,
  then the step fails as `SIDEBAR_ROW_SIZE`, naming 96px and 48px.
- Given a list without the row,
  then the step fails as `NO_SIDEBAR_ROW`.
