# Decision: trace refuses a `Since` version the requirement isn't in

- Approval: decided by Liam on HAL-13777 (from HAL-13752); Liam signs this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:EGhZd7DAKGuIms3obap/h9X2rk+OHlcdUM26N9xtTUtvaBW1JzSvliD0wKUFRV6WnvwJrOPmdNKt3OoLiCtjCg==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:V+6xaCOuKwv9t/FyGedVEROA2uCn4pf9TZLnFUqV4e8016LSbV5qkg1s4ZsVWid42pQn8fVPgqtKugCDA3TADA==

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
rather than turning the rule off. A clone without tags gets one error that
says `git fetch --tags` and checks no version until it has them, not even
the app version: the app version is also the last release's version until
the next release pull request raises it, so the exception would pass every
`Since: 0.1.0` unchecked there (HAL-14684).

Twenty-one requirements written after v0.1.0 still said `Since: 0.1.0` and
now say `Since: unreleased`. Two are guard paths (`check.guard-dependency`,
`spec.verifies-counts-retries-once`), moved here from HAL-13752. One more,
`integration.sheet-shows-everything`, said a guessed `Since: 0.1.2` and now
says `Since: unreleased` too. The guard wants every edited active
requirement named, so Covers lists all twenty-two by ID.

## Covers

- .github/
- packages/testing/spec/
- tooling/check/
- agents.host-chat
- app.doctor-time-limit
- check.guard-dependency
- engine.final-signal
- integration.sheet-shows-everything
- kit.chat-box-line
- kit.chat-composer
- kit.chat-end-line
- kit.chat-message
- kit.chat-tool-line
- kit.chat-transcript
- kit.toast-clear-of-focus
- recording.svg
- routines.signal-loop
- routines.signals-due
- spec.verifies-counts-retries-once
- studio.workspace-agents-chat
- workflow.validate-choice-values
- workflow.validate-template-names
- workflow.validate-wait-signal
- workspace.hub-uses
- yaml.edit-rename
