# studio-click-test.list-card-steps

- Status: active
- Since: unreleased
- Source: HAL-19002 (PR 2 of Liam's approved plan, 27 Nov)

The click test shall check the checkbox, item verdict and suggested-task card kinds as card steps (`studio-click-test.card-steps`), right after the one-question card step. On each surface the step shall click the card's own controls, a checkbox or a radio found by its words, and then Submit, which sends them in one answer. It shall then read the copy back through the test Paperclip's API and pass when the copy's status and the result fields the step names match, whatever other fields Paperclip adds and in whatever order it lists them. A control that never shows shall fail the surface as `NO_OPTION`, naming the control.

The kinds it checks:

1. **Checkbox confirmation**, taking one or two of Email, Blog and Social: Email and Blog in the Inbox, Social in the Messenger. Paperclip has each copy `accepted` with those picks.
2. **Item verdicts**, Approve, Reject and Defer for a teaser post and a recap post: Approve and Defer in the Inbox, Defer and Approve in the Messenger. Paperclip has each copy `answered` with those verdicts. Reject needs a reason by Paperclip's default, so the step leaves it out.
3. **Suggested tasks**, two drafts: the press note in the Inbox, the survey in the Messenger. Paperclip has each copy `accepted`, with the picked draft made and the other skipped.

## Examples

- Given a checkbox card whose Inbox copy Paperclip records with the picks Email and Blog in the other order,
  then the checkbox step passes.
- Given a verdict card whose Recap post has no Defer,
  then the verdict step fails as `NO_OPTION`, noting "Inbox:".
- Given a suggested-task card that Paperclip records with the other draft made,
  then the step fails as `WRONG_ANSWER`, noting what Paperclip has.
