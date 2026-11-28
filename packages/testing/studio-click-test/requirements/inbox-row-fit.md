# studio-click-test.inbox-row-fit

- Status: active
- Since: unreleased
- Source: HAL-20759, from the reviews of #6858 and #6863 (HAL-20675): the new design's sizes that no click step read yet

When the Inbox step shows the seeded card's row, the click test shall read the heights the app drew for the row's title, its meta line and its avatar's badge before it clicks the row, and shall fail the step as `PLAIN_ROW_FIT`, naming both heights, unless the title takes at most 40px (two 20px lines, `kit.plain-row-fit`) and the meta line at most 20px (one line, `inbox.row-meta-wraps`). Where the avatar has no badge, it shall fail the step as `NO_AVATAR_BADGE`; where the badge isn't 20px (`kit.avatar-badge`), as `AVATAR_BADGE_SIZE`.

## Examples

- Given a row whose title takes 40px, whose meta line takes 20px and whose badge is 20px,
  then the step passes.
- Given a row whose title takes 60px,
  then the step fails as `PLAIN_ROW_FIT`, naming 60px and 20px.
- Given a row whose badge is 16px,
  then the step fails as `AVATAR_BADGE_SIZE`.
- Given a row whose avatar has no badge,
  then the step fails as `NO_AVATAR_BADGE`.
