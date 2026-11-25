# cli.commands.serve.loopback-runbook

- Status: active
- Since: unreleased
- Source: HAL-18502 (S9a, part 1 of the server engine runbook, loopback only, for the PR watcher's routines); HAL-17512 `server-engine` rev 2, §6; Julian's security note on HAL-17513, findings S1, S3 and S9; `server.paperclip-key-store`, `server.routines`

The server engine runbook (`docs/guides/server-engine.md`) shall give one systemd unit whose `ExecStart` runs `halonic serve` with `--dir` and `--port` and with neither `--network` nor `--public-origin`, so the server listens on `127.0.0.1` only. The unit shall run as the `halonic-engine` user with `UMask=0077`, shall drop all traffic that isn't loopback (`IPAddressDeny=any` with `IPAddressAllow=localhost`), shall count exit 143 as a normal stop, and shall have no `Environment` or `EnvironmentFile` line, so it holds no password, key or token. No command in the runbook shall pass a value to `halonic secret set`, by argument or pipe: the value is typed at the hidden prompt. The runbook's commands and files shall configure no proxy site and no public hostname.

Rationale: part 1 serves routines on the server with no outside access, so a later edit to the runbook mustn't open the port, put a secret in the unit or the shell's history, or add a proxy without its own review.

## Examples

- Given the runbook's unit, then its `ExecStart` has `serve --dir … --port 4747` and no `--network` or `--public-origin`.
- Given a runbook edit that adds `Environment=HALONIC_SECRET_SERVE_PASSWORD=…` to the unit, then the test fails.
- Given a runbook edit that adds `echo … | … secret set serve-password`, then the test fails.
- Given a runbook edit that adds a `proxy_pass` or `reverse_proxy` block, then the test fails.
