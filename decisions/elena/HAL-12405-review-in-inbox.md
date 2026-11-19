# Decision: Review in Inbox opens the item the run waits on

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12405
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ms4QhUTlHeXtE5pda0N6nvYYqTGJ0580+wtx83epkQOka2bbhSoH34d866ydAi3MGtA7ICgxA2ABOHWyHwMpAA==

A run's **Review in Inbox**, on the run page and on the workflow page's run card, used to open the Inbox with nothing
selected, so the right pane showed the New request form and a person could start a second run by mistake. Now it opens
the card of the item that run has waited on longest, the one the run's banner describes, the same way Home's Needs you
opens its item. When none of the run's items waits any more, the Inbox opens as before. This is a bug fix inside the
approved Inbox flow, so it is a team decision; no wording changed.

`inbox.page` gains a sentence for this and an example, with a test. Every existing example still holds and no test was
weakened.

## Covers

- inbox.page
