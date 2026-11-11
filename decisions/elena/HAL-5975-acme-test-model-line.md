# Decision: the Acme review step says the test model writes the same reply to any email

- Approval: decided by the team on [HAL-5956](/HAL/issues/HAL-5956) (E1), asked for on [HAL-5975](/HAL/issues/HAL-5975); the maintainer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ogJHewzMCA5BzPibbsXozpI1cyFKXZ3AnhRWrJ4TwC566v8x1gb99qMYSkg1dabTLYE4AmblvS4TI+WcERBUDw==
- Task: HAL-5975

## What changes

The last line of the `review` wait step in the Acme sample's `support-reply` workflow changes from
"Sample: approving finishes the run. Nothing is sent." to "Sample: the test model writes this reply
to any email. Approving finishes the run. Nothing is sent." Someone trying the sample with their
own email otherwise sees a reply about a damaged order and can't tell why.

The two `halonic run` golden files print that step's body, so they follow. They also pin the
workspace's `definitionsVersion`, a hash of the definitions, which changes with the text. Nothing
else in them changes. No requirement or test was changed, weakened or removed: the rendering tests
that quote the old line use it as their own fixture and keep it.

## Covers

- apps/cli/src/commands/run/golden/support-reply-approved.txt
- apps/cli/src/commands/run/golden/support-reply-waiting.txt
