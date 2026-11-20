# Decision: a new routine that runs an agent is written only with the prompt the person typed

- Approval: asked for by Liam in the review of HAL-12401 (#3757); wording is the HAL-12401 team decision (Sofia's N1 to N7 on HAL-12363) under the HAL-2282 rule; the reviewer (Liam) approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:C+HN93bzkl5KQfgQFWzbqdyZF4O8S1MB9tPxF0HMh3HiwygaTGT4owe0v7xYFafClGrN0ZDzrtYdhacE2DgfBg==
- Task: HAL-13498

## What changes

`studio.workspace-routines`: a new routine in a hub with no workflow starts the hub's first agent
with the prompt the person typed, no longer with "Describe what to do.". Made without a prompt, it
is refused with "Say what *Name* should do." and nothing is written. The one example about a hub
with an agent and no workflow is updated to match; no example is removed or weakened.

The draft requirement `routines.new.create` adds a **Prompt** to the New routine dialog when the
routine will run an agent: empty, with "Describe what to do." as its hint and "Say what *Name*
should do." under it. **Create** with an empty prompt focuses it and creates nothing.

## Why

"Describe what to do." reads like a hint, but it was saved as the agent's real task, so Run now sent
the agent that text as its whole job. HAL-12401 fixed the same problem in the Starts card. A routine
file needs a non-empty prompt, so the routine can't be written first with an empty one; the dialog
asks for it before the file exists instead.

## Covers

- studio.workspace-routines
