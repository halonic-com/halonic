# Decision: the agent page shows one state for its first read, and the sandbox Callout is read once

- Task: HAL-13177
- Approval: decided by the team on HAL-13177 (Sofia's design check C516 on HAL-14955, S-4 and S-5; flow-agents 3.1's page states, approved by the board). Liam signs on review.
- Kind: user-visible

## What changes

`agents.chat.first-load`: in v0.1 the Try it chat's first load is the agent's, so the page now
shows **one** state for it, flow-agents 3.1's ("Loading Sorter", "Still loading", "Couldn't load
this agent"). It shows in the panel, and the chat shows nothing meanwhile. While the panel doesn't
show beside the chat (closed, or a narrow tab), the chat shows that same state instead. One
**Try again** reads the agent and its settings again, and the agent's name then takes the focus.
The chat's own words for H7 and H11 ("Loading this chat", "Couldn't load this chat") are gone from
the agent page.

`agents.page.frame`: while the agent is read, the page names it as the host already knows it
("Loading Sorter", and the header's name), as its tab does, rather than by its id.

`shell.item-page-chat`: the shell tells the chat whether the panel shows beside it, so the agent
page can leave its loading state to the panel. The chat's `render` gets a second argument,
`panelShown`; pages that don't need it ignore it.

`agents.chat.sandbox`: the Callout no longer sits inside the box's status region. Screen readers
hear only its first line, once, as it shows, not "Check again", "Read the guide" and "opens in your
browser" with it.

Tests: `try-it-panel.test.tsx` tested the chat's own loading and can't-load lines, which are gone.
It now checks that the chat shows what the page gives it until the agent is read. The page's single
state is tested in `agent-page-chat.test.tsx`, and "Loading sorter" in `agent-page.test.tsx` is now
"Loading Sorter".

## Why

While the agent was slow or couldn't be read, the chat and the panel each showed their own state:
two "Still loading · Try again", or "Couldn't load this chat" next to "Couldn't load this agent".
The chat's Try again read only the chat and dropped focus to the page body, and the header said the
id "writer" (C516 S-4). The Callout's buttons were read as part of the status line (C516 S-5).

## Covers

- agents.chat.first-load
- agents.chat.sandbox
- agents.page.frame
- shell.item-page-chat
- packages/studio/features/agents/src/chat/try-it-panel.test.tsx
- packages/studio/features/agents/src/page/agent-page.test.tsx
