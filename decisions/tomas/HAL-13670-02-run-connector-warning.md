# Decision: a run logs and warns about a connector whose tools it couldn't list

- Approval: Paperclip task HAL-13670 (from Liam's triage of HAL-13667; the design is recorded on the task); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:igEi+8MkHY59cOqkZgcWiizs5WqCek4TeFfWzgacrmdswl6jIXmbgQkU3eo9WICP/S2Nl9INCfMcBTRU320dAQ==

A run whose agent lists a connector whose program isn't on this computer ended "✓" with no word
about the connector: the turn left its tools out and kept the reason only for the model. Now:

- The run log gets a `connector.listing-failed` event (new requirement
  `events.connector-listing-failed`) with the agent, the connector and a `connector-not-started`
  cause. `events.run-log-contract` lists it among the events added since the reference. No
  reference event or field changes.
- Its cause is the one a `tool.result` already gets for a connector that didn't start
  (`engine.tool-result-cause`, signed on HAL-12471): the program or the secret's name when
  `connectorStartFailureOf` reads the adapter's error, else `other`. The engine builds both from
  the same function.
- `halonic run` warns once for each such connector, with the cause and its fix
  (`cli.run-connector-warning`), and goes on.

## Covers

- events.run-log-contract
