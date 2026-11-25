# ports.team-status-agent-detail

- Status: active
- Since: unreleased
- Source: agent and seat detail pages, flows 1.3 and 1.4 (HAL-17737); Liam's decision C on task HAL-18050

The `TeamStatus` port shall have an optional `agent(id, range)` read that answers one agent's `AgentDetail` for a spend range, or nothing when the source doesn't know the agent, and that leaves `teamStatusVersion` at 1. Every field of `AgentDetail` shall be optional: the seat it is on now with since when and who moved it (`seat-supervisor`, `board`, `observed` or `other`, never a login or a name), the seats it used in the range, its run total with failures counted by cause (`time-out`, `spend-limit`, `no-identity`, `adapter-error` or `other`), counts of merged pull requests and done tasks without titles, and a web link. A source without `agent` shall still be a whole `TeamStatus`.

## Examples

- Given a `TeamStatus` without `agent`,
  when it is compiled,
  then it compiles, and `teamStatusVersion` is still 1.
- Given an `AgentDetail` with only `asOf`,
  when it is compiled,
  then it compiles.
- Given an `AgentDetail` whose `movedBy` is a login, or whose failure cause the port doesn't name,
  when it is compiled,
  then it doesn't compile.
