# Decision: Accept on a file changed since the run opens Compare

- Approval: /HAL/issues/HAL-16056 (HAL-11945 row Q9; words in HAL-16075)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nZTDwlj6jlFSFWXUS6U0gKR8Ax7VCUIVwQV9EWYpbmp/dvkiBPJzeVuBy2nkOrh7c4ler0u4OGCjZqpQFzkFCg==

Until Compare shipped, a file that changed after the run started kept only
**Reject**, with a line saying so, and once every open file had changed,
**Accept all** didn't show (C665 26, "until Compare ships"). This pull request
ships Compare (`inbox.proposal-compare`, HAL-11945 row Q9), so those files keep
**Reject** and **Accept**, **Accept** opens Compare, and **Accept all** stays.

- `inbox.proposal-page`: the changed file's line becomes "This file changed
  after run 01JD8Q started. Accept opens Compare." (C665 26's start, since the
  host can't tell who changed it, and Q9's end); the file keeps **Accept**;
  focus moves to the next file's **Accept**, and stays in Compare while it is
  open; **Accept all** no longer hides.
- `inbox.proposal-phone`: the phone bar keeps **Accept all** for the same
  reason.

The tests for both are rewritten to match, with no fewer tests.

## Covers

- inbox.proposal-page
- inbox.proposal-phone
