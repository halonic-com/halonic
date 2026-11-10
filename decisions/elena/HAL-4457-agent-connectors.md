# Decision: a run's agent gets only the connectors its file lists

- Approval: [HAL-4457](/HAL/issues/HAL-4457); the package owner approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:MfK+3LXk9BRVPEzznL6/rzdUa1yIYWaPf2ddaG9Uwsx2OnV/fMMCW4clOgSmBFBF4LrWmRd6fV1fkhwHmwBJAw==
- Task: HAL-4457

## What changes

`engine.run-connector-calls` said a run's model call offers "the connected servers' tools", so
every agent of a run was offered every connector, whatever its file's `connectors` said. It now
says the model call offers only the connectors the agent's kept file lists, and none to an agent
whose file lists none or that the run's definitions have no file for. A new example covers it.

`engine.local-chat-turn` said a chat turn offers "the connected servers it was given". It now says
a chat turn that names an agent with a file gets only the connectors that file lists. A chat turn
that names no agent, or an agent without a file, still gets every connector, as before: that is the
person's own chat, and calls from it already pass the outside-run gate.

## Why

Least privilege. An agent's `connectors` field ("Connector ids whose tools this agent may use")
was ignored, so a `lead` agent with no connectors was offered a tracker's `create_issue`. The old
engine offered an agent only its own connectors, and the old test-runner suites (HAL-4448) rely on
it. No host passes connectors to the executor yet, so no existing workspace loses a tool it had.

The tests that ran a connector call without an agent file now give the writer a file that lists
`mail`; they check the same things.

## Covers

- engine.run-connector-calls
- engine.local-chat-turn
