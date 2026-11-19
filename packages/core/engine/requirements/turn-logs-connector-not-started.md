# engine.turn-logs-connector-not-started

- Status: active
- Since: unreleased
- Source: HAL-13829 (CN2 of the C248 check on HAL-13818): a step whose connector couldn't start read ✓, and nothing named the program or the secret

Where a model turn has a run log, when a connector the turn offers tools from can't list them, the engine shall write one `connector.not-started` (`events.connector-not-started`) for it before the turn's first model call, with the agent, the connector's id and the same `connector-not-started` cause a call to it would get (`engine.tool-result-cause`): the program or the secret's name when `connectorStartFailureOf` reads the error, else `why: "other"`, never any part of the error's message. It shall write it whether or not the model then calls one of the connector's tools, and again in each turn that lists it, an agent's turn after a person's OK included. A turn whose connectors all list their tools shall write none.

## Examples

- Given a run whose agent lists the connector `mail`, whose program `acme-mail-mcp` isn't on this computer,
  when the agent's turn runs and its model answers without calling a tool,
  then the log holds `connector.not-started` with `connector: "mail"` and `cause: { code: "connector-not-started", why: "program-missing", name: "acme-mail-mcp" }`, before the turn's `llm.request`.
- Given the same with the secret `mailbox-token` not set,
  when the agent's turn runs,
  then the cause is `secret-not-set` with `name: "mailbox-token"`.
- Given a connector that lists its tools,
  when the agent's turn runs,
  then the log holds no `connector.not-started`.
