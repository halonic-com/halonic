# Decision: The stepper refusal says to decline the request and ask again

- Approval: Sofia decided the wording on HAL-20346 under the board-approved frames (HAL-2282 rule); a team decision with no board card
- Kind: user-visible
- Task: HAL-20346

## What changes

`action-steppers.check-gate-request` said a request whose expect lacks a required name is refused
with `This request doesn't say what the requester saw: "head_sha".` That sentence showed raw field
names, called the agent "the requester" and did not say what to do next. The requirement now says
the refusal reads:

`This request leaves out what the agent saw before asking, so Halonic can't check this step. Decline it and ask again.`

The field names stay out of the sentence; the refusal's `check` still points developers at the
step's `requiredExpect`. The example changes to the same sentence, and the test that names the
requirement asserts it exactly.

## Covers

- action-steppers.check-gate-request
