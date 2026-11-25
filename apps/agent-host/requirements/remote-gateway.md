# agent-host.remote-gateway

- Status: active
- Since: unreleased
- Source: HAL-10827 (follow-up of HAL-5685); the risky switch from HAL-12237 (tunnel phase B build plan, decision 12); the switch-on gate from HAL-12243 (decision 19)

The agent host shall run the remote gateway's listener, on loopback only, while the host offers remote and remote is on (`agent-host.remote-settings`), and at no other time. The host shall offer remote only when it has a tunnel provider, the only way a phone reaches the gateway: the executable's entry point gives the Tailscale provider (`tunnel-tailscale.provider`) only when a `tailscale` program is installed (`tunnel-tailscale.tailnet-host`), checked once when the host serves and only when the host could offer remote, and code that calls `run` itself may give its own. No launch argument or environment variable turns remote on, and remote stays off until the person turns it on. With the Tailscale provider, the gateway's listener shall also accept the `Host` a request through the tunnel carries, read each time the listener starts, and refuse a request that came through Funnel (`remote-gateway.public-request`). Given a provider, the host shall offer no remote over `--stdio`, without a profile folder, or while another host holds the profile's lock, and shall say why on standard error. Each time remote turns on, the listener shall start on a free loopback port, or on the port the offer names. If the listener can't start, then the agent host shall say why on standard error and serve all the same. The gateway shall list (the newest sessions that fit in one `sessions` reply of at most one gateway message, 65,519 bytes), watch, answer an approval a bridge asked for and send a prompt on the host's own sessions only, through the run ledger (`agent-host.gateway-run-ledger`): a prompt shall reach the run through the call Studio's own answers take. A phone's answer to an approval a bridge asked for shall go to Studio as `approvals.remote-decision` with `source` set by the host, and settle nothing itself: the ledger settles from the answer the approval's own call ends with, a decision for an approval Studio doesn't have waiting or has already decided shall be refused, and when Studio doesn't answer the approval shall go on waiting and never count as allowed. The agent host shall refuse every other approval a phone answers, because an answer through the run would skip the engine's own decision on the call, and a phone shall not be allowed to answer an approval the host judged `risky` unless the person's "Let phones answer risky approvals" switch is on. The switch shall be off unless the host is given one, and shall be read again for every answer a phone sends, so turning it off takes effect at once. The agent host shall stop the listener before it stops the runs' sessions, and count the gateway's port among its own while it listens, so no provider's address may be that port.

## Examples

- Given the host started without a tunnel provider, even with remote left on or `--remote-gateway` on its command line,
  when something connects to the port the gateway would have used,
  then the connection is refused: nothing listens.
- Given a host with a tunnel provider and remote off,
  when something connects to the gateway's port,
  then the connection is refused.
- Given a host with a tunnel provider and remote left on,
  when something sends an HTTP request to the gateway's port,
  then the gateway's listener answers it, and it is closed when the host stops.
- Given the executable on a computer where Tailscale is signed in, and remote left on,
  when a WebSocket handshake that names the node's tailnet name and serve port reaches the gateway's port,
  then the listener answers 101; with `Tailscale-Funnel-Request` it answers 403, and when the host stops, its serve entry is removed.
- Given the executable on a computer where Tailscale is installed, and a fresh profile,
  when the host serves,
  then remote is offered and off, and no serve entry is added.
- Given a run that waits for an approval,
  when the gateway answers it as `approve`,
  then the answer is refused, the run gets no input, and the approval still waits.
- Given the risky switch turned on and then off again,
  when a phone answers a risky approval,
  then the answer is refused as not allowed remotely.
- Given a run that waits for a prompt,
  when the gateway sends a prompt,
  then the run gets an `answer` input with its text.
