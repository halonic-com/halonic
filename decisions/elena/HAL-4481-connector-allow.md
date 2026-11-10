# Decision: a run keeps its connectors' tools lists and offers only what `allow` keeps

- Approval: [HAL-4481](/HAL/issues/HAL-4481); the package owner approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:GfuYay9/okCiGa7jNg7JirtKZWaZEDsJML5SxvNnCXwd8sLFYimTu4KQmxBqb6uKTwksot0g105sYnja/eHmAA==
- Task: HAL-4481

## What changes

`workspace.run-definitions` said a new run starts with the workflow and the hub's agents,
workflows, collections and knowledge sources. It now also starts with the `tools` lists (`allow`
and `approve`) of the connectors the hub can see, by connector id, and nothing else of their files.
A new example covers it.

A new requirement, `engine.run-connector-allow`, says a run's model call offers only the tools a
connector's kept `allow` list names, every tool when the file has none, and none of a connector
whose file isn't in the run's kept definitions.

## Why

A connector file's `allow` ("Only these tools are offered to agents") was applied only outside runs,
by the outside-run gate. Once a host passes connectors to runs, a run's agent would be offered tools
the file leaves out. The old engine applied it.

Where it is applied: in the engine, from the run's kept definitions, not in the host when it builds
`ConnectorClient`s. A run goes on with the definitions it started with (`engine.kept-definitions`),
so a run that waits for an OK keeps the `allow` list it started with even if the file changes. The
outside-run gate also reads `allow` from the file and not from the client, so both paths read the
same list the same way, by the name the server lists a tool under.

Only the `tools` lists are kept, not the whole connector file: a run needs to know what its agents
are offered, not how to connect, so a transport's URL, headers and environment stay out of the
blob store.

A connector with no lists in the kept definitions is offered nothing (least privilege). No host
passes connectors to runs yet, so no kept run loses a tool it had.

The CLI's `support-reply` goldens show the run's `definitionsVersion`, the hash of its kept
definitions. They now hold `connectorTools` (empty in that example), so the hash changes, and
nothing else in the goldens does.

## Covers

- workspace.run-definitions
- engine.run-connector-allow
- apps/cli/src/commands/run/golden/support-reply-waiting.txt
- apps/cli/src/commands/run/golden/support-reply-approved.txt
