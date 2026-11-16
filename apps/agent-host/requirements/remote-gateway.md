# agent-host.remote-gateway

- Status: active
- Since: 0.1.0
- Source: HAL-10827 (follow-up of HAL-5685)

The agent host shall listen on no port for the remote gateway in every launch the executable makes: no launch argument, environment variable or setting turns it on, because the gateway takes no pairing yet (phase B). Only code that calls `run` with a gateway setting, which tests do and the executable's entry point never does, shall start the listener, on a free loopback port or the port the setting names; then, over `--stdio`, the agent host shall not start it, and shall say why on standard error. If the listener can't start, then the agent host shall say why on standard error and serve all the same. The gateway shall list (the newest sessions that fit in one `sessions` reply of at most 64 KiB), watch and send a prompt on the host's own sessions only, through the run ledger (`agent-host.gateway-run-ledger`): a prompt shall reach the run through the call Studio's own answers take. The agent host shall refuse every approval a phone answers, because an answer through that call would skip the engine's own decision on the call; approvals reach the engine in a follow-up. The agent host shall stop the listener before it cancels the runs, and count the gateway's port among its own, so no provider's address may be that port.

## Examples

- Given the host started without a gateway setting, even with `--remote-gateway` on its command line,
  when something connects to the port the gateway would have used,
  then the connection is refused: nothing listens.
- Given a test that calls `run` with the gateway on and a free port,
  when something sends an HTTP request to that port,
  then the gateway's listener answers it, and it is closed when the host stops.
- Given a run that waits for an approval,
  when the gateway answers it as `approve`,
  then the answer is refused, the run gets no input, and the approval still waits.
- Given a run that waits for a prompt,
  when the gateway sends a prompt,
  then the run gets an `answer` input with its text.
