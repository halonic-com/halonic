# kit.button-name

- Status: active
- Since: unreleased
- Source: HAL-15105 (C538-5, the team's decision on a detail of HAL-14489's Inbox Next); base component specs 23.5

When a `Button` with words is given a `name`, the kit shall name it by its `name` while it isn't busy, so a screen reader hears what the words leave out, and while it's busy as it would be without one, by its `busyName` or its words. The `name` shall start with the words you see. `name` shall not be accepted on an icon button, which is named by its `label`.

## Examples

- Given `<Button name="Next: Approve this reply?, 2 left">Next: Approve this reply? · 2 left</Button>`,
  when it renders,
  then its accessible name is "Next: Approve this reply?, 2 left" and its text is "Next: Approve this reply? · 2 left".
- Given the same button while `busy` with no `busyName`,
  when it renders,
  then it has no `aria-label`, so it's named by its words.
