# Decision: the action stepper explains a service outage, warns before a step that can't be undone, and tags a requester's paste-back field

- Task: HAL-17856
- Approval: Noah's Stage C visual check on HAL-17841 (document `visual-check`), a design fix on a screen the board approved (HAL-10, 24 Nov) under the HAL-2282 rule; Liam reviews the pull request on HAL-17856 and signs this note
- Kind: user-visible

## What changes

- `action-steppers.by-hand`: while the service is down, the stepper now says so above the steps ("GitHub isn't answering right now, so the steps may fail. You can do them all by hand below.") and opens only **Do it all by hand**. Each step's own **Do it by hand** now opens by itself only when that step failed. Before, every step's guide and the whole guide opened together, with no reason given. **Run step 1 of 3** is no longer the primary button while the service is down. One example is added. The test "opens every guide by itself while the service is down" becomes "says the service is down above the steps and opens only the whole guide", with more assertions, not fewer.
- `action-steppers.browser`: on a requester's step, the paste-back field's hint says "From <requester>, not checked by Halonic" (HAL-17491 7.1). **Copy instructions** now shows those words, at the size of **Open the page** (HAL-17491 8.4), instead of the kit's "Copy".
- `action-steppers.review`: while the request can still run, a Callout under the facts warns about each step not done yet that can't be undone, by its number and its own words (HAL-17491 6.4). One example is added.

The closing line (declined, expired, finished) moves to just under the title, and the by-hand address and **Show the request**'s calls wrap at 390px. Neither changes a requirement's text.

No test was weakened, skipped or deleted. The screen isn't in the Inbox yet, so no user has seen the old behaviour.

## Why

The visual check found that an outage opened every guide with nothing to say why, and that the review never warned before a step that can't be undone, as HAL-17491 6.4 asks. The other changes match HAL-17491 7.1 and 8.4 word for word.

## Covers

- action-steppers.by-hand
- action-steppers.browser
- action-steppers.review
