# secrets-file.store

- Status: active
- Since: unreleased
- Source: HAL-195 (PR 9a-1b); design approved by Liam on HAL-8325

The file secret store shall keep the secrets a person sets in one JSON file, `{ "version": 1, "secrets": { "<KEY>": { "name", "value", "allowedOrigins"? } } }`, keyed by the `secretKey` form of each name and holding the name as it was last written. It shall read the file at every call, so a secret set by `halonic secret` while `halonic serve` runs is found at once. A save shall write a temporary file in the same folder, flush it and rename it over the secrets file, so a reader finds the old secrets or the new and never half of them, and no temporary file stays behind. Saves shall run one after another, in one process and across programs, under a write lock in the file's folder (`write.lock`, with the `RunLockRecord` rules of the record store), so none is lost (HAL-13855). A secret may also hold the origins its value may be sent to, one to eight, each as `http` or `https` scheme, host and port with no path or user info: `setAllowedOrigins` shall record them for a stored secret, `allowedOrigins` shall read them, a secret without any shall read as `undefined`, and a new value for the secret shall keep them (HAL-11871). It shall refuse a file it doesn't understand (not JSON, the wrong shape, an entry whose key isn't its name's, an empty or over-long value, an origin list that is empty, too long or holds anything but an origin, a version other than 1) with an `unavailable` error that names the file and the fix, and never saves over it.

## Examples

- Given an empty profile, when `openai-key` is set, then the file holds `{ "version": 1, "secrets": { "OPENAI_KEY": { "name": "openai-key", "value": "…" } } }`.
- Given a store that set `openai-key`, when a second store over the same file reads it, then it finds the value.
- Given twenty secrets set at once, then all twenty are in the file and no `.tmp` file is left.
- Given two stores over the same file that each set a different secret at once, then both secrets are in the file.
- Given a file that holds `{ "version": 2, "secrets": {} }`, then every call refuses it with the fix "Update Halonic, then run again.", and the file is unchanged.
- Given a file whose entry `OPENAI_KEY` has the name `other-key`, then every call refuses it as damaged.
- Given a stored `openai-key`, when `https://llm.example.com/v1` is allowed, then `allowedOrigins` reads `["https://llm.example.com"]`; and after the key gets a new value it still does.
- Given a secret that was never given origins, then `allowedOrigins` reads `undefined`.
- Given an empty list, `http://user:pw@llm.example.com` or `ftp://llm.example.com`, then `setAllowedOrigins` refuses it with a `RangeError` that doesn't repeat the address.
