# Decision: Settings shows a line when the agent sandbox's security updates are overdue

- Approval: Sofia's wording in the approved HAL-7373 plan; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JqOI4D4xLMMHtppSvxQLZhwkD25VgkPZnTKQXi3w2BdvwZTfCfcv0wt0uoFJmpa+Y8tV61KjcjsR36GSweSPBQ==

## What changes

- Settings > Agent sandbox shows one line, "Security updates for the agent sandbox are overdue.", when the host reports the updates as overdue.
- The line never blocks anything. It is hidden when the host cannot say. An unreadable status counts as overdue, with no date.
- The requirement `settings.agent-sandbox-section` gains one sentence and one Example for the line.
- The second sentence of the plan's wording is dropped, because there is no update button.

## Why

The approved plan asks users to see when the sandbox's security updates are overdue. The requirement had to state the line, because it is user-visible.

## Covers

- settings.agent-sandbox-section
