# Decision: approvals name the agent, not its id

- Task: HAL-11693
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11693 (a small fix to an approved screen; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:yPsmgjz+FhfO6+2W7H91x48IofAuQ3X++p1T4/HRdgqqX7Np4PFXREvM09znxZoEfFo1Z3slrHxd+dH6hMz7Dw==

## What changes

The Inbox approval card and row, Home's Needs you row and the run page's approval banner now say the
agent's `name` ("Handbook reader wants to use read_text_file"). They used to show the agent's id
("handbook-reader"). The id shows only when the agent file can't be read, as the
requirement already said. The banner escapes hidden characters in the name.

The requirement `inbox.approval-title` gains a case for this. No test was weakened or skipped.

## Why

The CLI already says "Handbook reader", and Studio showed an id the person never chose to see
(found in the HAL-11670 walk of the Examples pages).

## Covers

- inbox.approval-title
