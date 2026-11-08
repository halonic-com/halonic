# format.integration-file

- Status: active
- Since: 0.1.0
- Source: HAL-143 (#271), the sheets in halonic-com/integrations at 2eda45e; trace gap from the HAL-741 review (HAL-889)

When `parseFile` reads an `integration.yaml` permission sheet, the format shall accept an exact lower-case host or a `{ fromSetting }` host, fill in empty `secrets`, `tokens`, `tools` and `needs`, require every tool to state its `risk` and whether it is `untrusted`, cap every limit so a sheet can't switch it off, and fail, at the offending line, a secret sent to a host the sheet doesn't declare, a thing listed twice, and any unknown key.

## Examples

- Given the weather example in `docs/guides/integrations.md`, when it is parsed, then it passes with its secret, tool and limits as written.
- Given the `knowledge-mcp`, `model-gemini` and `tool-google-drive` sheets from the integrations repo, when they are parsed, then they pass with no warnings.
- Given only `id`, `version`, `kit`, `provides` and `hosts`, when it is parsed, then `secrets` is `{}` and `tokens`, `tools` and `needs` are `[]`.
- Given `hosts: ['*.example.com']` or an IP address, when it is parsed, then it fails with `invalid_format` at `hosts[0]`.
- Given a secret whose `hosts` include `files.example.com`, which `hosts` leaves out, when it is parsed, then it fails with `secret-host-not-declared` at that host.
- Given `provides: [connector, connector]`, when it is parsed, then it fails with `duplicate` at `provides[1]`, line 4.
- Given `limits: { timeoutMs: 0 }` or a `maxResponseBytes` over 1 GiB, when it is parsed, then it fails at that limit.
- Given the `knowledge` section older sheets had, when it is parsed, then it fails with `unrecognized_keys`.
