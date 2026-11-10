# Decision: the guard checks a signed note offline instead of asking Paperclip

- Approval: Liam decided this on [HAL-3434](/HAL/issues/HAL-3434) and [HAL-3444](/HAL/issues/HAL-3444); the design is written into [HAL-1337](/HAL/issues/HAL-1337)
- Kind: internal

GitHub's runners can't reach Paperclip, so the approval lookup that waited for a Paperclip API token
is dropped. The guard now checks a signature line in the note against keys that the base branch pins
in `tooling/check/approvers.json`. `check.guard-approval-fails-closed` said the lookup failed closed
while there was no token; it now says the guard fails closed when it isn't given the pull request's
number, head and base, or can't read them. Its old test, which expected the token message, is
replaced by two tests of the new statement. This note can't be signed yet: the merge base has no
signing tool and its guard is the stub, which is advisory.

## Covers

- check.guard-approval-fails-closed
- tooling/check/src/test/guard-notes.test.ts
