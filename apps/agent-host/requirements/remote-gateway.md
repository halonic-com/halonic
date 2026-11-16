# agent-host.remote-gateway

- Status: active
- Since: 0.1.0
- Source: HAL-10827 (follow-up of HAL-5685)

The agent host shall start the remote gateway's listener only when it is started with `--remote-gateway`, on a free loopback port, or on the port `--remote-gateway-port` names; with neither argument it shall listen on no port for the gateway. If `--remote-gateway-port` is given without `--remote-gateway`, or its value isn't a whole number from 1 to 65535, then the agent host shall refuse to start, with exit code 2. Over `--stdio` the agent host shall not start the gateway, and shall say why on standard error. If the listener can't start, then the agent host shall say why on standard error and serve all the same. The gateway shall list, watch, answer an approval and send a prompt on the host's own sessions only, through the run ledger (`agent-host.gateway-run-ledger`): an answer or a prompt shall reach the run through the call Studio's own answers take. A phone shall not be allowed to answer an approval the host judged `risky`, because nothing on the host allows it yet. The agent host shall stop the listener before it stops the runs' sessions, and count the gateway's port among its own, so no provider's address may be that port.

## Examples

- Given the host started without `--remote-gateway`,
  when something connects to the port `--remote-gateway-port` would have named,
  then the connection is refused: nothing listens.
- Given the host started with `--remote-gateway --remote-gateway-port <free port>`,
  when something sends an HTTP request to that port,
  then the gateway's listener answers it, and it is closed when the host stops.
- Given a run that waits for an approval,
  when the gateway answers it as `approve`,
  then the run gets an `approval` input for its call id, and the session shows the approval settled.
- Given `--remote-gateway-port 70000 --remote-gateway`,
  when the host starts,
  then it exits with 2.
