# agent-host.remote-gateway

- Status: active
- Since: unreleased
- Source: HAL-10827 (follow-up of HAL-5685)

The agent host shall listen on no port for the remote gateway in every launch the executable makes: no launch argument, environment variable or setting turns it on, because the gateway takes no pairing yet (phase B). Only code that calls `run` with a gateway setting, which tests do and the executable's entry point never does, shall start the listener, on a free loopback port or the port the setting names; then, over `--stdio`, the agent host shall not start it, and shall say why on standard error. If the listener can't start, then the agent host shall say why on standard error and serve all the same. The gateway shall list (the newest sessions that fit in one `sessions` reply of at most 64 KiB), watch, answer an approval a bridge asked for and send a prompt on the host's own sessions only, through the run ledger (`agent-host.gateway-run-ledger`): a prompt shall reach the run through the call Studio's own answers take. A phone's answer to an approval a bridge asked for shall go to Studio as `approvals.remote-decision` with `source` set by the host, and settle nothing itself: the ledger settles from the answer the approval's own call ends with, a decision for an approval Studio doesn't have waiting or has already decided shall be refused, and when Studio doesn't answer the approval shall go on waiting and never count as allowed. The agent host shall refuse every other approval a phone answers, because an answer through the run would skip the engine's own decision on the call, and a phone shall not be allowed to answer an approval the host judged `risky`, because nothing on the host allows it yet. The agent host shall stop the listener before it stops the runs' sessions, and count the gateway's port among its own, so no provider's address may be that port.

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
