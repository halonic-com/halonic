# Decision: the agent page opens on Flow

- Approval: HAL-13180 (Liam's answer to the plan's question, 21 Nov); Liam approves this note in review
- Kind: user-visible

## What changes

An agent's page now opens on **Flow**, the agent map, instead of Configuration. An agent just made
in the New agent dialog with "What should it do?" left empty still opens on Configuration ›
Behaviour with Instructions focused; when it is opened again later, it opens on Flow. Opening an
agent at its model (`openItem(agent, { step: "model" })`) still opens Configuration › Model.

`agents.page.frame` and `agents.page.new-agent` (both draft) say so, and their examples change from
"opens on Configuration" and "opens on Configuration › Behaviour" to "opens on Flow".

## Why

flow-agents 2.2 says every later open starts on Flow (HAL-119, U10), and an agent made with
something written opens on Flow too. The page opened on Configuration only because Flow didn't
exist yet (HAL-12399). Liam chose to switch in this pull request, together with the lines and the
fit, because a map without them was a weaker first screen than Configuration. The board approved
the flow, so the switch is a team decision.

## Tests

No test was skipped or deleted. Four tests that expected the page to open on Configuration now
expect Flow, with the same number of checks:

- `page/agent-page.test.tsx`: "shows AGENT and the name at once, and opens on Flow" checks that
  Flow is selected and Configuration isn't.
- `page/agent-page.test.tsx`: "focuses Instructions on Behaviour for a just-made agent, and opens
  it on Flow later" and "opens other agents on Flow without taking the focus" check Flow is
  selected and no Instructions box is shown, where they checked the box was shown but not focused.
- `configuration/model-page.test.tsx`: "opens on Flow without the step" checks no Configuration
  page is shown, where it checked Behaviour was.

## Covers

- agents.page.frame
- agents.page.new-agent
- agents.configuration.open-at-model
