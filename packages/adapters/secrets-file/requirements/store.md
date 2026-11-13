# secrets-file.store

- Status: active
- Since: 0.1.0
- Source: HAL-195 (PR 9a-1b); design approved by Liam on HAL-8325

The file secret store shall keep the secrets a person sets in one JSON file, `{ "version": 1, "secrets": { "<KEY>": { "name", "value" } } }`, keyed by the `secretKey` form of each name and holding the name as it was last written. It shall read the file at every call, so a secret set by `halonic secret` while `halonic serve` runs is found at once. A save shall write a temporary file in the same folder, flush it and rename it over the secrets file, so a reader finds the old secrets or the new and never half of them, and no temporary file stays behind. Saves in one process shall run one after another, so none is lost; saves from two programs at the same moment may lose one, because there is no lock. It shall refuse a file it doesn't understand (not JSON, the wrong shape, an entry whose key isn't its name's, an empty or over-long value, a version other than 1) with an `unavailable` error that names the file and the fix, and never saves over it.

## Examples

- Given an empty profile, when `openai-key` is set, then the file holds `{ "version": 1, "secrets": { "OPENAI_KEY": { "name": "openai-key", "value": "…" } } }`.
- Given a store that set `openai-key`, when a second store over the same file reads it, then it finds the value.
- Given twenty secrets set at once, then all twenty are in the file and no `.tmp` file is left.
- Given a file that holds `{ "version": 2, "secrets": {} }`, then every call refuses it with the fix "Update Halonic, then run again.", and the file is unchanged.
- Given a file whose entry `OPENAI_KEY` has the name `other-key`, then every call refuses it as damaged.
