# Decision: Change budget opens Workspace settings at the Budget block

- Task: HAL-10915
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12749 (Liam's yes to the plan, with four changes; row B6 of the UX acceptance rows on HAL-12735, and Sofia's answer on HAL-12748 for B7: same tab, Back comes back)
- Kind: user-visible

## What changes

`workspace.workspace-page` gets a fourth command, `workspace.open-budget`. It opens Workspace
settings like `workspace.open-models`, then puts focus on the **Budget** heading (an `h3` inside the
Models section) and fills the Budget block with accent-soft for 1 second. The colour changes at
once, with no movement, so reduced motion needs nothing. The editor doesn't open. A new request or
the page closing takes the fill off. The requirement now also says what the three section commands
already did: scroll to the section and focus its first heading, also when it draws late.
`workspace.open-models` still lands on the **Models** heading, not on **Budget** inside it.

`inbox.budget-notices`: **Change budget** now opens Workspace settings at its Budget block
(`workspace.open-budget`) in the same tab, instead of "Settings › Models".

The Models feature drops `Models.openBudget()` from its `api.ts`: nothing provided it, and the
command does what its doc said.

Nothing is removed from a requirement or weakened, and no test changes except added ones.

## Why

Row B6: **Change budget** should land where the budget is changed, not at the top of Models. Row
B7 (Sofia, HAL-12748): the page opens in the Inbox's tab, and the tab's **Back** is the way back,
with focus on the Inbox heading as for any page after Back. That is the shell's behaviour already,
so B7 needs no code here.

## Covers

- workspace.workspace-page
- inbox.budget-notices
