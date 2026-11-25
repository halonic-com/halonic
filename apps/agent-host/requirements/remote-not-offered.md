# agent-host.remote-not-offered

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decision 19 (HAL-12232); tasks HAL-12237 and HAL-12243

While the agent host offers no remote (it has no tunnel provider, as when the executable runs on a computer without `tailscale`, or it serves over `--stdio`, has no profile folder or doesn't hold the profile's lock: `agent-host.remote-gateway`), and when the profile's remote files can't be read, the agent host shall serve a `RemoteControl` that shows remote unavailable and off, with no phone and no pairing, and shall refuse to turn remote on, open a pairing or change the risky switch. It shall keep no file and open no socket. When the remote files can't be read, the agent host shall say why on standard error.

## Examples

- Given a host the executable launched on a computer without `tailscale`, when Studio reads the remote state, then it says `available: false` and `on: false`, and Studio shows no Remote section.
- Given a host the executable launched on a computer without `tailscale`, when Studio opens a pairing, then the answer is 409 `remote_refused`.
- Given a host with a tunnel provider, when Studio reads the remote state, then it says `available: true`.
- Given a host with a tunnel provider and a paired phones file that isn't JSON, when Studio reads the remote state, then it says `available: false`, and standard error says why.
