# Decision: the Runs list can open for one workflow

- Task: HAL-10177
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10209 (Liam's review of #2905; a team decision with no board card, HAL-2282 rule: it builds on the approved Runs list)
- Kind: user-visible
- Signature: pending

## What changes

The requirement `runs.list` gains one rule: when another place asks for one workflow's runs, as a
workflow's **See all** does, the Runs list opens with a pressed "Workflow: *name*" chip and shows
only that workflow's runs, with the Live and Needs you counts following it. Pressing the chip shows
every workflow, and the next plain opening shows every workflow. A workflow with no run says "No
runs of this workflow yet." with Show every workflow. Two examples are added.

Nothing existing is removed or weakened. No test is changed, skipped or deleted; tests for the
filter, the chip and the empty line are added.

## Why

The workflow Runs view's See all (HAL-10174) opens the Runs list, which showed every workflow.

## Covers

- runs.list
