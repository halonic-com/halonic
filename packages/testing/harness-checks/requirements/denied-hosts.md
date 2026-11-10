# harness-checks.denied-hosts

- Status: active
- Since: 0.1.0
- Source: HAL-4475 (HAL-1710 check 1: "where do token refreshes go")

The check's sandbox runner shall turn on sandbox-runtime's debug log for the launcher only, and read from the program's error output the `host:port` of each connection the sandbox refused, in the order they came, repeats included, so that a program refused at a host an earlier program was also refused at still shows the refusal. It shall pass the program's output on unchanged.

## Examples

- Given the line `[SandboxDebug] No matching config rule, denying: platform.claude.com:443`, then the refused host is `platform.claude.com:443`.
- Given the line `Not logged in · Please run /login`, then no host is read from it.
- Given the same refusal twice, split across two chunks of output, then the runner lists it twice, and the output passes on byte for byte.
