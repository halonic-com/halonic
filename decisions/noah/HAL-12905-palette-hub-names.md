# Decision: a Ctrl K option's name says its hub, and run rows name their hub

- Task: HAL-12905
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12905 (Sofia's keyboard and screen-reader check, HAL-12896, row Q4; the names are built from words the row already shows, a team decision under HAL-2282; Liam reviews the pull request on HAL-12905 and signs this note)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/XGbVuhP0FOohLqA9EpO07tNO832QsaZ191lGS0aaS7U3d3MGJGVx+R4B9U81U6wZttkrpv7dVU2HEJaJr8pCw==

## What changes

Each Ctrl K row shows its kind and hub, such as "Agent · Reports", but a screen reader heard only
"Reporter, agent", so two Writer agents in different hubs both read "Writer, agent" (WCAG 1.3.1).
An option is now named with its name, its kind, its hub and "switch to tab", in the order the row
shows them: "Writer, agent, Reports". A row with no hub, such as Home or an action, reads as before.

Search providers give the hub's name as `SearchResult.hubName`; the Agents, Workflows, Routines and
Runs providers fill it in. Run rows showed the hub's id ("Run · reports") where every other row
shows its name; they now show "Run · Reports", from a new optional `RunsSource.hubName` that the
desktop app reads from the hub files. When the workspace no longer has the hub, the row keeps
showing its id.

The requirements `shell.palette-options`, `runs.search` and `studio.workspace-runs` say so, and
`shell.palette-options` gains an example for two same-named agents in different hubs, with a test.
The search-provider tests now also expect the hub's name. No test was weakened or skipped.

## Covers

- shell.palette-options
- runs.search
- studio.workspace-runs
