# workspace.trust-skip

- Status: active
- Since: 0.1.0
- Source: Liam on HAL-1984 (a run that can only reach the test model needs no trust); moved from the CLI into the workspace package on HAL-4065, so Studio uses the same rule

The workspace package shall say a workspace's runs can only reach the test model, and so need no trust, exactly when every provider has the type `mock`, the workspace has no local integration, and its trust content is empty: no connector, refused or not, and no agent that starts a harness program. Any part trust covers turns the skip off, including a part added later.

## Examples

- Given the Acme example (the `mock` provider, agents without a harness or with `halonic`, no connector), then the skip holds.
- Given the Acme example plus a provider of another type, such as `anthropic`, then the skip is off.
- Given the Acme example plus a connector, a connector whose URL is refused, an agent with the harness `claude-code`, or a local integration with a `{ fromSetting }` host, then the skip is off.
- Given the Acme example plus a local integration whose hosts are all fixed, then the skip is off, and the integration is in the trust content.
