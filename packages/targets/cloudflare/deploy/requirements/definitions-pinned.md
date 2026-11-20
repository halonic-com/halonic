# deploy.definitions-pinned

- Status: active
- Since: unreleased
- Source: HAL-13629 (follow-up of HAL-13589); build plan 3a (HAL-198)

The deploy shall bind the version it uploads to the snapshot it wrote for that deploy, as the plain-text binding `HALONIC_DEFINITIONS_VERSION` holding the snapshot's version, in place of any binding of that name the caller gave. `current` stays as the newest snapshot written; the runtime reads it only when that binding is missing.

Rationale: the deploy writes the snapshot before the upload and the self-test. Pinned, the version that is live keeps reading its own snapshot until traffic switches, and a deploy whose self-test fails leaves it there. A snapshot's version is a hash of its files, so a rollback to an older Worker version reads that version's snapshot again, as long as the snapshot is kept.

## Examples

- Given deploy A went live, when deploy B writes its snapshot and its self-test fails, then A is still the live version and its upload binds `HALONIC_DEFINITIONS_VERSION` to A's snapshot, which is still in the bucket.
- Given a caller that binds `HALONIC_DEFINITIONS_VERSION` itself, then the upload binds it once, to the version the deploy wrote.
