# agent-host.gateway-idle-expiry

- Status: active
- Since: unreleased
- Source: phase 2 card approved by the board (HAL-17544); architecture note on HAL-17511, section 2.3 ("A lost phone", Julian's P4 on HAL-17540); task HAL-17636

When a paired phone has not been seen for more than 30 days (counted from its last seen, or from when it was paired if it was never seen), the agent host shall treat it as not paired: the phone shall be refused as a revoked phone is, with `not-paired`, and it shall leave the paired phones list. A phone with an open session shall not expire while that session is open.

## Examples

- Given a phone paired 31 days ago and never seen since,
  when it connects,
  then it is refused as not paired and leaves the list.
- Given a phone last seen 29 days ago,
  when it connects,
  then it is still paired.
