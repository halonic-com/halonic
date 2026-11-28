# studio-click-test.inbox-row-fit

- Status: active
- Since: unreleased
- Source: HAL-20759, from the reviews of #6858 and #6863 (HAL-20675): the new design's sizes that no click step read yet; Nora's review of #6876 (read what makes the promise, since the seeded row is short)

When the Inbox step shows the seeded card's row, the click test shall read, before it clicks the row, the computed values that keep the row 72px whatever its text: the title's line clamp and line height, the meta line's white-space and text-overflow (on the text before its whole end, where it has one), and the height of its avatar's badge. It shall fail the step as `PLAIN_ROW_FIT`, naming what it read, unless the title is clamped to 2 lines of 20px (`kit.plain-row-fit`) and the meta line is `nowrap` with an `ellipsis` (`inbox.row-meta-wraps`). Where the row has no title or no meta line, it shall fail the step as `NO_ROW_PART`, naming the part. Where the avatar has no badge, it shall fail the step as `NO_AVATAR_BADGE`; where the badge isn't 20px (`kit.avatar-badge`), as `AVATAR_BADGE_SIZE`.

## Examples

- Given a row whose title is clamped to 2 lines of 20px, whose meta line is `nowrap` with an `ellipsis` and whose badge is 20px,
  then the step passes.
- Given a row whose title is not clamped,
  then the step fails as `PLAIN_ROW_FIT`, before it clicks the row, even with a one-line title.
- Given a row whose meta line has `white-space: normal`,
  then the step fails as `PLAIN_ROW_FIT`.
- Given a row the XPath finds no title in,
  then the step fails as `NO_ROW_PART`, naming the title.
- Given a row whose badge is 16px,
  then the step fails as `AVATAR_BADGE_SIZE`.
- Given a row whose avatar has no badge,
  then the step fails as `NO_AVATAR_BADGE`.
