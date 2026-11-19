# Decision: the engine's words for a missing agent host, and why a connector couldn't list its tools

- Task: HAL-12413
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12413 (rows G2 and C2 of Sofia's UX check of the error lines on HAL-12390; small wording on approved screens, a team decision with no board card, HAL-2282 rule)
- Kind: user-visible

## What changes

- `studio.workspace-google-setup-accounts` (G2): without an agent host,
  each change and Disconnect is refused as the engine not answering
  (`EngineNotAnswering`), and a host that doesn't answer (the transport's
  `AgentHostNotAnswering`, HAL-12410) reaches the page as it is, not as a
  problem Halonic can't explain. `failureLine` words it from
  `engineWords`: "Couldn't start the sign-in: the engine isn't answering.
  It may still be starting." "Halonic needs its agent host to save this,
  and it isn't running." is gone.
- `studio.workspace-listed-tools` (C2): when the agent host says why the
  connector couldn't list its tools (`ConnectorFailedError`, HAL-12410),
  the desktop app passes the cause and its name to the page as
  `ConnectorCouldntList`, the same way it passes `WorkspaceNotTrusted`.
  The server doesn't say which secret it refused, so a refused secret
  carries every secret the connector declares.
- `library.listed-tools-waiting` (C2, G2): the connector page words each
  cause: a missing program by its name in code type; a secret that isn't
  set, or was refused, by its name with `halonic secret set NAME` in a
  command box; a refused secret of a connector with several secrets names
  them all, with `halonic secret set` in code type in the line; a refused
  secret of a connector with none says the server asked for a secret the
  connector doesn't send, with **Copy details** (Sofia's word check on
  HAL-12413); a program that stopped, with **Copy details**; any other
  failure as before, with **Copy details** when Halonic can't explain it.
  An engine that isn't answering gets the words for where Studio runs.

Library Summarize without an agent host now rejects with
`EngineNotAnswering` too, so its existing "host unreachable" line, already
in the engine's words, shows instead of the old "Summarize needs the agent
host" text.

No test was skipped or loosened.

## Covers

- studio.workspace-google-setup-accounts
- studio.workspace-listed-tools
- library.listed-tools-waiting
