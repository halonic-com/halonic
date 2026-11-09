# ports.sandbox-fence-proof

- Status: active
- Since: 0.1.0
- Source: HAL-958 design, section 4 and decision 8.4: a sandbox shows that it is really running before any untrusted code loads

The `SandboxSession` shall report a fence proof, settled before `open` returns, that is `fenced`, `not-fenced` with a one-sentence reason, or `stopped` once the session is closed, and `start` shall throw while the proof is `not-fenced`.

## Examples

- Given an adapter whose probes were both refused (a canary file the fence hides, a canary loopback port the fence blocks),
  when `open` returns a session,
  then the session's fence proof is `fenced`.
- Given an adapter whose canary file probe could be read,
  when the session is opened,
  then the fence proof is `not-fenced` with a reason that names the probe, and `start` throws.
- Given a fenced session,
  when it is closed,
  then its fence proof is `stopped`.
