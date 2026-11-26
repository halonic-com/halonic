# inbox.stale-source

- Status: active
- Since: unreleased
- Source: HAL-19190 (the installed Inbox said the engine isn't answering on every load, and its screen couldn't say which load failed)

While the Inbox's last load failed, the line over the list shall carry, in its `data-failed` attribute and not in its text, which load failed (`runs`, `proposals` or `setup:<provider>`) and that failure's fixed kind: the shell's `code`, else a kinded error's `kind`, else the error's name. It shall never carry the failure's message. When a load succeeds, the attribute shall go.

## Examples

- Given an Inbox whose waiting runs load but whose agent host's proposals fail with the host not answering (`host_unavailable`),
  then the line's `data-failed` is `proposals host_unavailable`.
- Given an Inbox whose waiting runs fail with a kinded `unavailable` error,
  then the line's `data-failed` is `runs unavailable`.
- Given a setup source of provider `google` that fails with a plain `Error`,
  then the line's `data-failed` is `setup:google Error`.
