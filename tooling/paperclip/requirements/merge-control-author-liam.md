# paperclip.merge-control-author-liam

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); HAL-14809 (board, 22 Nov), #4284

When a pull request is on a `liam/` branch, the plugin shall not count Liam's own approval, and shall count Julian's signed approval that also says "Author: Liam" whatever paths it touches.

## Examples

- Given Liam's approval on his own pull request,
  when a pass runs,
  then it isn't enqueued.
- Given Julian's approval with "Author: Liam" on Liam's pull request that changes `turbo.json`,
  when a pass runs,
  then it is enqueued; without "Author: Liam" it isn't.
