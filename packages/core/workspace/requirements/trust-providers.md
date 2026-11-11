# workspace.trust-providers

- Status: active
- Since: 0.1.0
- Source: HAL-5200 (code review of 11 Nov, on HAL-5196)

The workspace package shall add each model provider but the test model (`mock`) to the trust content, sorted by id, with its type, its `baseUrl` normalised as a connector's URL is (only when the file names one), its secret by name and never its value, `local`, and its options as written when there are any. Only its name stays out. A provider whose `baseUrl` has user info, a backslash before its query, or no `//` after `http:` or `https:` shall be refused instead, with the reason and without its address, and content with a refused provider shall have no fingerprint. A workspace whose only provider is the test model shall have the same content and fingerprint as one without providers. The trust changes shall list providers that are new, changed (with the fields that differ) and removed.

## Examples

- Given a trusted provider, when its `baseUrl`, path included, its secret, its type, `local` or its options change, or its `baseUrl` or secret is removed, then the fingerprint changes and the change doesn't only remove things.
- Given a trusted provider, when only its name, the order of the providers or the way its host is written (capitals, the default port) changes, then the fingerprint stays the same.
- Given a provider whose `baseUrl` is `https://ops:pw@api.anthropic.com/v1` or `https://evil.test\@api.anthropic.com/v1`, then the provider is refused, the password isn't in the content, and the content has no fingerprint.
- Given only the test model, then the content and fingerprint are the same as a workspace's without providers.
