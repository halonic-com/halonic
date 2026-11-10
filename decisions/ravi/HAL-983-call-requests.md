# Decision: a runner's requests end with their call, and Halonic caps what it queues for the runner

- Approval: Liam set both gates for the runner start on [HAL-983](/HAL/issues/HAL-983) (decided on [HAL-4353](/HAL/issues/HAL-4353)), with the head-cap entry count from the security read on [HAL-4375](/HAL/issues/HAL-4375); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5gMIUGzQqekglfMiIjduLNYkFJvfZFCK0Xfzsvq6xU7+7NPvuugcjCFsRn1z4/wqnU9QoAMJe+sW0GvQPXWEAg==
- Task: HAL-983

## What changes

`integration-runner.requests` gains these promises and two examples:

- a request with more than 100 headers or 16 secret placements fails with `request-too-large`,
  and each header and placement counts 4 bytes more toward the 32 KiB cap;
- when a call answers, is cancelled or fails, Halonic closes its requests: it aborts the kit's
  request, drops the body, frees the slot and answers `call-not-running`;
- a `pull`, `cancel-body` or `abort` for a request closed that way is ignored, not a violation.

`integration-runner.call-limits` gains these promises and two examples:

- the runner is stopped (`channel-failed`) once it leaves more than 8 MiB of its stdin unread;
- settings too large for the `start` frame stop the runner with the new reason `start-too-large`;
- a call whose arguments don't fit in a frame uses up no call number.

One existing test changed: the "request at the cap" case in `request-size.test.ts` now counts the
4 bytes for its one header and its one placement, so it still sits exactly at the cap. Every other
promise and example stays as it was. No example was removed or weakened.

## Why

These are the two merge gates Liam set before anything may start a runner. A cancelled call kept
its kit request running and could still deliver a `head` after it ended, and bodies left unread
held their slots forever, so eight of them blocked every later request with `too-many-requests`.
Halonic's writes to the runner were unbounded, so a runner that sends but never reads grew
Halonic's memory. The count caps close the gap the security read found in the 32 KiB cap: about
16,000 tiny headers fit under it. All of this hardens behaviour inside design HAL-958, so the note
is internal.

## Covers

- integration-runner.requests
- integration-runner.call-limits
- packages/adapters/integration-runner/src/halonic/request-size.test.ts
