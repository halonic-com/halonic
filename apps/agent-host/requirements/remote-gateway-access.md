# agent-host.remote-gateway-access

- Status: active
- Since: unreleased
- Source: HAL-15400 (found while building the phase B attack suite, HAL-12242); ADR "Pairing and the end-to-end session"

When the agent host starts the remote gateway with its pairing desk and its paired phones, the gateway shall take each pairing message 1 to the desk, and send a refusal the desk gives as it is. A pairing message 1 that can't be read shall cost no try. A message 3 that doesn't decrypt or whose commitment doesn't match, and a handshake that ends after the host's message 2 without one that does, shall each count as one wrong try at the desk, never two. A message 3 that decrypts shall use the code with the phone's name, platform and check code: a code another phone used meanwhile shall be refused, and otherwise the phone shall hear the person's answer, `allowed`, `denied` or `timed-out`. A phone that leaves while Allow is awaited shall end the pairing as the phone leaving; one that leaves after Allow was pressed shall still be kept. The gateway shall count a phone as paired only while the paired phones list it, open its session in that list so a revoke cuts it, and treat a phone revoked between those two steps as not paired. The gateway shall give the host's static key from the secrets port (`agent-host.remote-host-key`) and the name the Pair a phone dialog shows. If a phone's last seen can't be saved when its session ends, then the agent host shall say why on standard error, and the session shall end all the same.

## Examples

- Given no open pairing,
  when pairing message 1 arrives,
  then it is refused as `code-ended`.
- Given an open pairing,
  when a handshake closes after the host's message 2,
  then the code has 4 tries left, not 3.
- Given a phone whose message 3 decrypted,
  when the person presses Don't allow,
  then the phone hears `denied`.
- Given a phone waiting for Allow,
  when its connection closes,
  then the pairing ends as the phone leaving and the phone hears `timed-out`.
- Given a paired phone revoked after its message 2,
  when its first transport message decrypts,
  then opening its session throws, and it isn't counted as connected.
