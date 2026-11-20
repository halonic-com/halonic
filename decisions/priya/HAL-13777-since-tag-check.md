# Decision: trace refuses a `Since` version the requirement isn't in

- Approval: decided by Liam on HAL-13777 (from HAL-13752); Liam signs this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2tCrUYmuicgZq3mCQKbfJyZbXmnOPLyS6QNQ4QHsUOzv9YWLnMIgrVImdp3F9WyFkn6dgifbZJ/esomBxfTpBw==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:1BZQ2MHW+6JGzmYgc9YevaZhzHQQWJ5MVdc01+zbEZoYxPMt8J5mC0bg+UplwYqNhCKiTiTMB66Fu1eHXX7mDQ==

Trace now checks that `Since: <version>` is true. `Since: unreleased`
always passes. A version needs the tag `v<version>`, and that tag has to
hold the requirement, by its path or by its `# <id>` heading. Otherwise
trace fails and says to write `Since: unreleased`. This is Liam's rule from
HAL-13777, after 26 requirements written after v0.1.0 said `Since: 0.1.0`
or a guessed `0.3.0` (HAL-13752).

One exception: the app version in `apps/studio/package.json` passes while
it has no tag. The release pull request writes the new version into
`Since` before the release bot tags the merged commit, so without it every
release pull request, and the `main` run right after its merge, would fail.

Tags are read from git objects only, never the network. CI fetches them
(`fetch-tags: true` on the build job's checkout and the guard job's head
checkout) instead of skipping the rule, so a missing fetch fails loudly
rather than turning the rule off. A clone without tags gets an error that
says `git fetch --tags`.

Nineteen requirements written after v0.1.0 still said `Since: 0.1.0` and now
say `Since: unreleased`. Two are guard paths (`check.guard-dependency`,
`spec.verifies-counts-retries-once`), moved here from HAL-13752.

## Covers

- .github/
- packages/testing/spec/
- tooling/check/
