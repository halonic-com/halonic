# parity.allowed-fixture-differences

- Status: active
- Since: 0.1.0
- Source: HAL-117 (plan 9.3 point 7.3: allowed differences live in one file, each with its requirement ID)

Where an entry of `allowed-differences.json` shows in the parity fixtures, it shall list each fixture file with its old and its new result written out in full. The compare shall allow a difference only when an entry names the fixture file and writes out exactly those two results. If an entry names a fixture file that doesn't exist, no longer differs, or differs in another way than written, then the compare shall report it as stale. If a fixture is malformed, or the same fixture file is listed twice, then reading the file shall fail.

## Examples

- Given a difference and an entry with exactly its two results, proposed or signed off, then the file is allowed.
- Given a difference and no entry that names the file, then the file is different.
- Given an entry whose new result has another line than the new code gives, then the file is different and the entry is stale.
- Given an entry for a file whose old and new results are the same, then the entry is stale.
- Given the package's own `allowed-differences.json`, then every fixture file it names is one the compare lists.
