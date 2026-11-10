# harness-checks.report

- Status: active
- Since: 0.1.0
- Source: HAL-4475 (HAL-1710 "Reporting": harness, sign-in path, refresh path, and whether `allowedSites` needs provider hosts)

The report shall give, for each harness, the sign-in path and the refresh path as one verdict each: through the bridge, when the prompt was answered and a model call that carried a sign-in reached the bridge and was answered; needs provider hosts in `allowedSites`, naming the hosts, when the prompt wasn't answered and the sandbox refused connections; otherwise inconclusive, with the reason. The report shall be Markdown that holds only names, paths, hosts, status codes, counts and present or absent, never a header's value or anything Claude Code printed.

## Examples

- Given an answered prompt and a `POST /v1/messages` with `authorization: present` answered 200, then the sign-in path is "through the bridge".
- Given a prompt that ended "signed-out" and the refused host `platform.claude.com:443`, then the verdict names `platform.claude.com`.
- Given an answered prompt whose requests carried no sign-in, then the verdict is inconclusive and says so.
