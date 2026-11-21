# Decision: a run logs which part of a plugin is off, and warns about it once

- Approval: Paperclip task HAL-12343 (Nina's C54 check on HAL-12637, passed on by Liam: a local tool that can't run must say so in the run, never silently); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/HFryQop53lE6pq4WcVBnE3//qycH+uAA8UrWHbeRYFS2ZKfIEZxLoWyRFiqsEJqy62RM/tfMH3ZLDtq40aQAA==

A plugin's connector joins its backend and its local tools. When one of them can't start, for
example because the sandbox can't start on this computer, the CLI warned, but the run's log had no
record of it. When no part started, the log had only `connector.listing-failed` with the cause
`other`, and the CLI gave a second warning that said less than the first. Now:

- The run log gets a `connector.part-off` event (new requirement `events.connector-part-off`) with
  the agent, the connector, the part (`backend` or `local:<name>`) and a reason code. It never
  holds an error's text. `events.run-log-contract` lists it among the events added since the
  reference. No reference event or field changes.
- `ConnectorClient` gets an optional `newPartsOff` (new requirement `ports.connector-parts-off`),
  so the port's version stays 1. A plugin's connector gives each part once
  (`app.plugin-connector-parts-off`), and the engine logs them after each listing, before the
  listing's own failure (`engine.connector-part-off`).
- `halonic run` gives no `connector.listing-failed` warning for a connector whose parts the log
  already named as off (`cli.run-connector-warning`), because it already warned for each part.

## Covers

- events.run-log-contract
- cli.run-connector-warning
