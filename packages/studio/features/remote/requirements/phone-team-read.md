# remote.phone-team-read

- Status: draft
- Since: unreleased
- Source: HAL-19022 (phase 2 G3e, found while starting L2 on HAL-17643, row L2-7; architecture note on HAL-17511, sections 2.2 and 2.3; protocol `packages/core/ports/src/remote-gateway-messaging.ts`)

While the computer speaks message version 4 and has welcomed the phone, the phone shall send each team status request (`team-read` of `parts`, `seats`, `pull-requests`, `queue`, of `spend` with its range, and of one `pull-request`) once, and settle it by the host's `team-data` that names it and the same `what`, or by the host's refusal (such as `not-found` for a pull request the host can't find, `offline`, `signed-out` or `not-supported`), keeping the connection. It shall not send a `team-read` of a pull request whose id breaks the protocol's id rule. It shall end the session on a `team-data` with a missing, extra or wrongly typed field, on one that answers nothing it waits for, on one whose `what` isn't what it asked, and on a pull request's `team-data` that doesn't hold exactly one item. When the connection drops before the host answers, the phone shall settle the request as cut off and never send it again. While the computer speaks only version 3, the phone shall send no `team-read`.

## Examples

- Given a phone welcomed by a version 4 computer,
  when it reads the merge queue and the host answers with a page,
  then the phone sent one `team-read` of `queue` and has the page's items.
- Given a phone reading this week's spend,
  when it sends the request,
  then its `team-read` names `spend` and the range `week`.
- Given a `team-read` of a pull request the host refuses with `not-found`,
  when the refusal arrives,
  then the read is refused with `not-found` and the connection stays open.
- Given a `team-read` of `queue`,
  when the host answers with a `team-data` of `seats`,
  then the phone ends the session and the read is cut off.
- Given a `team-read` waiting for its answer,
  when the connection drops and comes back,
  then the read is cut off and the phone doesn't send it again.
- Given a computer that speaks only message version 3,
  when the screens ask for the pull requests,
  then the phone sends nothing.
