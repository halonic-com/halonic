# Decision: the agent page is the shell's item page, with the Try it chat beside its views

- Task: HAL-13177
- Approval: decided by the team on HAL-13177 (flow-agents 3.1 layout, approved by the board; the item page's header rules are `shell.item-page-header`). Liam signs on review.
- Kind: user-visible

## What changes

`agents.page.frame`: on desktop the agent page is now the shell's `ItemPage`. Its header shows the
Agents icon, "Agent" and the name field, the Try it chat is on the left (`agents.chat.first-load`),
and Configuration or Runs is in the panel beside it. The chat's **Open Harness settings ›** shows
Configuration › Harness, and **Check again** on the Harness page shows in the chat's line too. The
phone keeps its own frame with the letter avatar.

`agents.page.rename`: the header's name field is the shell's. An empty name now puts the old one
back without a message, as on every item page, instead of saying "Give it a name.". A taken name
still says why.

Tests: `agent-page.test.tsx` and `configuration.test.tsx` now look for the name in the header's
name field and for the agent's read in the panel, since the chat has its own status lines. The
rename test checks that an empty name puts the old one back instead of the removed message. No
test is removed; each requirement keeps its tests.

## Why

flow-agents 3.1 puts the Try it chat beside the agent's views. `ItemPage` already draws that split,
with ✕, ⤢, the resize edge and the narrow-tab button, so the agent page uses it rather than a
second copy of the same layout. The empty-name rule comes with the shell's name field.

## Covers

- agents.page.frame
- agents.page.rename
- packages/studio/features/agents/src/page/agent-page.test.tsx
- packages/studio/features/agents/src/configuration/configuration.test.tsx
