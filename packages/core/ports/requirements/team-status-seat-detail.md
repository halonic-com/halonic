# ports.team-status-seat-detail

- Status: active
- Since: unreleased
- Source: seat detail page, flow 1.4 (HAL-17737); Liam's decision C on task HAL-18050

The `Seat` of the `TeamStatus` port shall also carry, as optional fields that leave `teamStatusVersion` at 1, each agent's share of the seat's week in percent (`agentShares`), the plan's plain-text label (`plan`), the plain-text label of the seats that share a manual reset (`manualResetGroup`) and a web link (`webLink`). A seat that leaves all four out shall still compile, and `Seat` shall still have no account, login folder or connection field.

## Examples

- Given a `Seat` without `agentShares`, `plan`, `manualResetGroup` or `webLink`,
  when it is compiled,
  then it compiles.
- Given a `Seat` with all four,
  when it is compiled,
  then it compiles, and it still can't carry an `account`.
