# runtime.definitions-version

- Status: active
- Since: unreleased
- Source: HAL-13629 (follow-up of HAL-13589); build plan 3a (HAL-198)

When the Worker's variable `HALONIC_DEFINITIONS_VERSION` is set, the runtime shall serve the definitions snapshot with that version, even when `current` names a newer one, under the scope's key prefix when a test sets a scope. When the variable is missing, the runtime shall serve the snapshot `current` names: `current` stays as the newest snapshot written, and the runtime reads it only as this fallback. When the variable is set but empty or isn't a snapshot version, wiring shall fail with a configuration error that names the variable, and shall not fall back to `current`.

Rationale: `halonic deploy` writes a new snapshot before it uploads and tests the new Worker version. If the live version read `current`, it would serve the new definitions before the new code is live, and keep serving them after a failed self-test. Pinned, each Worker version reads its own snapshot.

## Examples

- Given snapshots A and B, `current` naming B, and the variable set to A, then the runtime serves A's files.
- Given the same bucket and no variable, then the runtime serves B's files.
- Given a scope and the variable set to A's version under that scope, then the runtime serves A's files from the scope's prefix.
- Given the variable set to `""` or `latest`, then wiring fails with a `ConfigurationError` naming `HALONIC_DEFINITIONS_VERSION`.
