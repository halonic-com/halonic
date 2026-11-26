# cli.commands.serve.public-runbook

- Status: active
- Since: unreleased
- Source: HAL-18504 (S9, part 2 of the server engine runbook, the public name); HAL-19105 (a Cloudflare Access service token per desktop); the board's decision on HAL-18503 (public, `engine.` next to Paperclip's name, behind Cloudflare Access, reviews before the name resolves, a rate limit on pairing, open to a tailnet later); HAL-17512 `server-engine` rev 2, §4 and §6; `server.public-endpoint`

The public part of the server engine runbook (`docs/guides/server-engine-public.md`) shall give one systemd override whose `ExecStart` runs `halonic serve` with `--dir`, `--public-origin https://engine.<your domain>` and `--port`, without `--network`, after an empty `ExecStart=` that clears the unit's own line, and with no `Environment` or `EnvironmentFile` line. Its tunnel route shall forward only the path `^/api/` to `http://127.0.0.1:<port>`, and that port shall be the override's `--port`. Its steps shall put Cloudflare Access in front of the name, then the rate-limiting rule for pairing, then both reviews, and only then the tunnel route that makes the name resolve. Its Access step shall give an Allow policy for the board's identities and a Service Auth policy for the desktops' service tokens, and no Bypass policy. Its commands shall name no real domain, only `engine.<your domain>` and `github.com`, and shall run no `halonic secret set`: the sign-in password is set in part 1, at its hidden prompt.

Rationale: the public name is the only change in phase 2 that anyone outside can reach, so a later edit to the runbook mustn't forward more than the API, reach the server past the loopback listener, put a secret in the unit, or publish the name before Access, the rate limit and the reviews.

## Examples

- Given the runbook's override, then its `ExecStart` has `serve --dir … --public-origin https://engine.<your domain> --port 4747` and no `--network`.
- Given a runbook edit that sets the tunnel route's path to `^/`, then the test fails.
- Given a runbook edit that moves the tunnel route before the reviews, then the test fails.
- Given a runbook edit that adds a Bypass policy to the Access step, then the test fails.
- Given a runbook edit that names the board's real domain in a command, then the test fails.
