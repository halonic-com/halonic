# agent-host.remote-not-offered

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decision 19 (HAL-12232); task HAL-12237

Until the remote gateway takes pairings and passes its attack suite, every launch of the agent host shall serve a `RemoteControl` that shows remote unavailable and off, with no phone and no pairing, and shall refuse to turn remote on, open a pairing or change the risky switch. It shall keep no file and open no socket.

## Examples

- Given a launched host, when Studio reads the remote state, then it says `available: false` and `on: false`, and Studio shows no Remote section.
- Given a launched host, when Studio opens a pairing, then the answer is 409 `remote_refused`.
