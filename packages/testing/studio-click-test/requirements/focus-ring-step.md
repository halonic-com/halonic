# studio-click-test.focus-ring-step

- Status: active
- Since: unreleased
- Source: HAL-20621, the click step for `shell.focus-ring-after-pointer` that Nora's review of #6831 (HAL-19399 G9) left to a follow-up

When the focus ring step clicks Open demo on Welcome (closing the demo first when it is open), the click test shall wait for focus to land on a heading code focused and shall fail the step as `NO_CODE_FOCUS` when it doesn't, as `NOT_MARKED_POINTER` unless the window is marked `data-input="pointer"`, and as `RING_AFTER_POINTER` unless that heading's `box-shadow` is `none`. It shall then press Shift alone and fail as `MODIFIER_MARKED_KEYBOARD` unless the mark is still `pointer`, and then press Tab and fail as `NOT_MARKED_KEYBOARD` unless the mark is `keyboard`.

## Examples

- Given Open demo focuses the Inbox's title with no ring, marked `pointer`, and Tab marks the window `keyboard`,
  then the step passes.
- Given the title shows a ring after the click,
  then the step fails as `RING_AFTER_POINTER`.
- Given Shift alone marks the window `keyboard`,
  then the step fails as `MODIFIER_MARKED_KEYBOARD`.
