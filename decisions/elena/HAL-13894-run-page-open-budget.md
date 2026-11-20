# Decision: the run page's Change budget opens the Budget block

- Task: HAL-13894
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13894 (Liam's review on this task; it carries row B6, which Liam approved for the Inbox on HAL-12749, over to the run page of row B11 in the UX acceptance rows on HAL-12735)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Qi5YhoiDo/4rua9SGe5H8LSnmc8Cph6WWQqTIPC3wODPOv3IW8kNbTMfcA0bC89hzxOUKxK774RIe9JJmwSACQ==

## What changes

`runs.run-view.failure-banners`: the budget banner's **Change budget** now opens Workspace settings
at its Budget block (`workspace.open-budget`) in the same tab, as the Inbox's does, instead of
"Settings › Models". The button is left out where the page can't open the budget, as **Open
Models** is where it can't open Models.

The run card on the workflow page shows the same banner, so its **Change budget** runs the same
command.

Nothing is removed from a requirement or weakened. The run page's budget test now checks that
**Change budget** opens the budget and not Models.

## Why

Row B11: **Change budget** should land where the budget is changed, on the run page as in the
Inbox. HAL-10915 added `workspace.open-budget` and moved the Inbox to it; the run page was left on
`workspace.open-models`.

## Covers

- runs.run-view.failure-banners
