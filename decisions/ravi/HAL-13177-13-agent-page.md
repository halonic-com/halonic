# Decision: the agent page is the shell's item page, with the Try it chat beside its views

- Task: HAL-13177
- Approval: decided by the team on HAL-13177 (flow-agents 3.1 layout, approved by the board; the item page's header rules are `shell.item-page-header`). Liam signs on review.
- Kind: user-visible

## What changes

`agents.page.frame`: on desktop the agent page is now the shell's `ItemPage`. Its header shows the
Agents icon, "Agent" and the name field, the Try it chat is on the left (`agents.chat.first-load`),
and Flow, Configuration or Runs is in the panel beside it. The chat's **Open Harness settings ›** shows
Configuration › Harness through the item page's `show` (`shell.item-page-header`): a panel closed
with ✕ opens again, a narrow tab opens the panel's screen, and focus goes to the Harness tab.
**Check again** on the Harness page shows in the chat's line too. The phone keeps its own frame with the letter avatar.

`agents.page.rename`: the header's name field is the shell's. An empty name now puts the old one
back without a message, as on every item page, instead of saying "Give it a name.". A taken name
still says why.

Sofia's UX check C505 (HAL-14915) found three small gaps in the chat, fixed here:
`agents.chat.box-lines` now names the signed-out program, in the Harness page strip's words
("*Sorter* can't run until it's signed in to *Claude Code*.", HAL-6351), where it said "is
updated"; and **Send anyway** puts focus in the box, since its line goes. `agents.chat.try-it` now
announces a failure's whole line, so a screen reader also hears "Some tool calls already ran. Send
a new message to continue." and knows why there's no Try again.

Tests: `agent-page.test.tsx` and `configuration.test.tsx` now look for the name in the header's
name field and for the agent's read in the panel, since the chat has its own status lines. The
rename test checks that an empty name puts the old one back instead of the removed message. No
test is removed; each requirement keeps its tests.

After the rebase onto main, the agent map's Flow view (HAL-13180) is the panel's third view. Its
add buttons (Add tool, Add subagent, Add trigger) open Configuration on their page through the same
`show`, so they too reopen a closed panel; focus goes to the opened page's tab, or stays in the Add
subagent dialog when that opens. `agent-map.test.tsx` now looks for the map's skeleton in the panel,
since the chat has its own status lines, and the taken-name rename test presses Enter before it
reads the reason, as the shell's name field now waits for the typing to pause (HAL-12216).

After the rebase onto the page that opens on Flow (HAL-13180, #4370), the item page opens on Flow
too, or on Configuration for a just-made agent. `agent-page-chat.test.tsx` now expects Flow in the
panel beside the chat, and the two `agents.configuration.pages-narrow` tests in
`configuration.test.tsx` pick Configuration after the item page's first measure, since the page no
longer opens there.

After the rebase onto main's accessibility details (HAL-14377, #4268), the page keeps the shell's
header, so main's own rename field and its title overlay go. AG1 (Enter keeps focus in the name
field) and AG2 (the tab follows a rename) stay in `agents.page.rename`, and the shell's name field
meets them; AG1's test stays. AG4 (the focus ring outlines the title) stays in `agents.page.frame`:
the shell's `h1` holds the icon, "Agent" and the name field, so its test now checks that instead of
the overlay's classes. The `agents.page.new-agent` tests move to `agent-page-new-agent.test.tsx`
and the view state to `use-agent-view.ts`, for the file-size headroom. `tools-page.test.tsx` looks
for the Tools page's h2 headings in that page only, since the chat beside it has its own h2.

## Why

flow-agents 3.1 puts the Try it chat beside the agent's views. `ItemPage` already draws that split,
with ✕, ⤢, the resize edge and the narrow-tab button, so the agent page uses it rather than a
second copy of the same layout. The empty-name rule comes with the shell's name field.

## Covers

- agents.chat.box-lines
- agents.chat.try-it
- agents.page.frame
- agents.page.rename
- packages/studio/features/agents/src/page/agent-page.test.tsx
- packages/studio/features/agents/src/configuration/configuration.test.tsx
- packages/studio/features/agents/src/map/agent-map.test.tsx
- packages/studio/features/agents/src/page/agent-page-chat.test.tsx
- packages/studio/features/agents/src/page/agent-page-new-agent.test.tsx
- packages/studio/features/agents/src/configuration/tools-page.test.tsx
