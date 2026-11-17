# Decision: say "That page can't be shown here" when the guard sends the Android window back to the connect page

- Task: HAL-11415
- Approval: Liam (CTO) approves this requirement edit on HAL-11461 (https://paperclip.halonic.com/HAL/issues/HAL-11461#comment-d20325b6-b1a8-4f0a-9129-e58dd27238aa), at head 902393c4. A team decision with no board card (HAL-2282 rule; the board supervisor confirmed on HAL-11460 that requirement changes take agent signatures); the wording was decided by the team in HAL-11446.
- Kind: user-visible

## What changes

The requirement `studio.connect.remembered-address` gains one sentence. When the shell opened the
connect page because the window was on a page that can't be shown, the screen also says "That page
can't be shown here. Check the address and connect again." The requirement's example changes the
same way. Nothing else in the requirement changes.

## Why

When the navigation guard sends the window back to the connect page, the person saw the connect
screen with no explanation. The sentence tells them why. No test was weakened or skipped.

## Covers

- studio.connect.remembered-address
