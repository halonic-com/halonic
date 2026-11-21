# cli.commands.serve.agent-names

- Status: active
- Since: unreleased
- Source: HAL-13830 (AG1: the served Inbox named agents by their ids); `server.waiting-runs`

The `halonic serve` command shall give the server the names of the served workspace's agents, by id, as the agent files of the live version say, read again at every request, so `GET /api/waiting-runs` can name the agents and subagents its approvals name. When two agent files have the same id, the first one shall win, as on the desktop.

Rationale: a person reads an approval by the agent's name, as `halonic run` and the desktop show it. The names come from the live version, the one a run uses, as the workspace's name does: a rename saved in an agent file shows once a new live version holds it, and the next request then gets it.

## Examples

- Given a served workspace whose agent file `writer` is named "Writer", then the server is told `writer` is "Writer".
- Given the agent is renamed "Copywriter" in a new live version, then the next request is told "Copywriter".
