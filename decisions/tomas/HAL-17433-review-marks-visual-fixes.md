# Decision: the agent page's review mark sits around its field, not above it

- Task: HAL-17433
- Approval: Noah's design check C803 asks for this change (https://paperclip.halonic.com/HAL/issues/HAL-17432), written up on HAL-17433 (https://paperclip.halonic.com/HAL/issues/HAL-17433); Liam approves this note in review. A team decision with no board card (HAL-2282 rule): it follows the approved AI changes 1.2.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/xJKw9iiODQPxKrChzHKsQhmkBNRZ2vzn1AzjvCcO4FpkNwhkCTLInBxyuRnk1S2rXDJWzmQD5+RX03eEbTCCw==

## What changes

On the agent page's Configuration, the mark for a change to description, instructions, output,
model, most model calls, more settings or runs in now wraps its field: the sentence, the old value
struck through, the field as it is now, then **Accept** and **Reject**, in one block with the
coloured edge. Before, the mark was drawn above the field as a separate block, so the buttons sat
between the old value and the field.

The requirement `agents.review.changes-to-review` now says "around the field it changed" instead
of "above the field it changed". A test that the Model field sits inside its change's mark is
added. No test was weakened or skipped.

## Why

AI changes 1.2 and `ChangeMark` itself put the mark around the field it changed; the design check
C803 found the agent page drew it next to the field instead.

## Covers

- agents.review.changes-to-review
