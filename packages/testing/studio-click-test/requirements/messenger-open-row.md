# studio-click-test.messenger-open-row

- Status: active
- Since: unreleased
- Source: Nora's review of #6668 on HAL-19751 (26 Nov): `kit.avatar-on-row-fill` is something a user sees, so a click step checks it in the running app

After the Messenger step has sent its message and found the seeded agent's picture, where the chat list shows the seeded agent's row, the click test shall read the background colour the app drew for that open row and for its picture's tile, and shall fail the step as `TILE_ON_ROW_FILL` when they are the same, naming the colour. Where the window is too narrow to show the list beside the open chat, it shall compare nothing.

## Examples

- Given an open row drawn `rgb(236, 236, 240)` and its tile `rgb(255, 255, 255)`,
  then the step passes.
- Given an open row and its tile both drawn `rgb(236, 236, 240)`,
  then the step fails as `TILE_ON_ROW_FILL`, naming that colour.
- Given a narrow window that shows only the open chat,
  then the step compares nothing.
