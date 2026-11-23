# agent-host-client.this-computer

- Status: active
- Since: unreleased
- Source: HAL-13195; `agent-host.this-computer-sessions`, `agent-host.unfenced-gate`

The stand-in for the engine's `this-computer` sandbox shall ask the host's `GET /v1/sandbox/this-computer` once, when it connects, whether the host opens sessions on this computer. Where the host does, its check shall pass, and where it doesn't, its check shall fail with `not-offered`, so the engine refuses the run before anything starts. Its capabilities shall be shared files with no fence. It shall open a session with `POST /v1/sandbox/this-computer/open`, naming the workspace it was made for, the agent and the profile unchanged, and give the session the host's id and fence proof. It shall take the agent from the profile builder stand-in, which shall remember the agent of each of the last 64 profiles it built, by the profile's temp folder; for a profile it didn't build lately, the stand-in shall fail before it asks the host. The host checks the trust record, the person's choice and its own built profile itself, so the stand-in sends no token and decides nothing. When the host refuses, the stand-in shall throw an error with the host's status, kind and message.

## Examples

- Given a host that offers sessions on this computer,
  when the engine checks the sandbox,
  then the check passes, and the capabilities say there is no fence.
- Given a host that offers none,
  when the engine checks the sandbox,
  then the check fails with `not-offered`.
- Given a profile the builder built for the agent `writer`, with the harness's variables added,
  when the engine opens it,
  then the host gets the workspace, `writer` and that profile, and the session's fence is `off`.
- Given a profile the builder didn't build,
  when the engine opens it,
  then it fails and the host isn't asked.
- Given a host whose gate answers 403 `workspace_not_trusted`,
  when the engine opens a profile,
  then it gets that status, kind and message.
