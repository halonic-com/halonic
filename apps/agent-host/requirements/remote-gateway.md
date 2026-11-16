# agent-host.remote-gateway

- Status: active
- Since: 0.1.0
- Source: HAL-10827 (follow-up of HAL-5685)

The agent host shall listen on no port for the remote gateway in every launch the executable makes: no launch argument, environment variable or setting turns it on, because the gateway takes no pairing yet (phase B). Only code that calls `run` with a gateway setting, which tests do and the executable's entry point never does, shall start the listener, on a free loopback port or the port the setting names; then, over `--stdio`, the agent host shall not start it, and shall say why on standard error. If the listener can't start, then the agent host shall say why on standard error and serve all the same. The gateway shall list (the newest sessions that fit in one `sessions` reply of at most 64 KiB), watch, answer an approval and send a prompt on the host's own sessions only, through the run ledger (`agent-host.gateway-run-ledger`): an answer or a prompt shall reach the run through the call Studio's own answers take. A phone shall not be allowed to answer an approval the host judged `risky`, because nothing on the host allows it yet. The agent host shall stop the listener before it stops the runs' sessions, and count the gateway's port among its own, so no provider's address may be that port.

## Examples

- Given the host started without a gateway setting, even with `--remote-gateway` on its command line,
  when something connects to the port the gateway would have used,
  then the connection is refused: nothing listens.
- Given a test that calls `run` with the gateway on and a free port,
  when something sends an HTTP request to that port,
  then the gateway's listener answers it, and it is closed when the host stops.
- Given a run that waits for an approval,
  when the gateway answers it as `approve`,
  then the run gets an `approval` input for its call id, and the session shows the approval settled.
