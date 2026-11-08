# parity.allowed-differences-checked

- Status: active
- Since: 0.1.0
- Source: HAL-137

The parity package shall keep every allowed difference from the old repo in one file, `allowed-differences.json`, each entry with an id, the requirement ID that explains it, what the old repo did, what the new repo does, why, and whether it is proposed or signed off.

If an entry is malformed, has no requirement ID, has an unknown field or repeats an id, then the parity package shall refuse to read the file and name the entry, so a difference is never allowed by a typo.

## Examples

- Given an entry without "requirement", when the file is read, then reading fails and names the entry.
- Given an entry whose requirement is "run-store" (no package), when the file is read, then reading fails.
- Given an entry with the status "approved", when the file is read, then reading fails and names "proposed" and "signed-off".
- Given an entry with the misspelt field "reqirement", when the file is read, then reading fails.
- Given two entries with the same id, when the file is read, then reading fails and names the second entry.
