# contracts.action-sender

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers, the board's decision on HAL-10, 24 Nov 13:01 UTC), the architecture note on HAL-17491 (revision 12, section 2.4) with Julian's and Liam's reviews; ADR `docs/adr/2026-11-24-action-sender.md`; task HAL-17516; requirement `ports.action-sender`

Where an adapter implements `ActionSender`, it shall pass this suite without network access or a token of its own, against a stand-in service and a stand-in user at its native dialog. It shall say which account is signed in to a service by name only, sign in and out, and tell a cancelled sign-in from a service it doesn't know. It shall refuse, and send or open nothing for:

- a step that isn't on its route list by definition, version and step, or whose route is of the other kind (`not-in-catalog`);
- a placeholder value that is missing, extra, doesn't match its pattern, is empty, `.` or `..`, or holds `/`, `\`, `?`, `#` or `%` (`bad-value`);
- a body field that is missing, extra, of the wrong kind or doesn't match its pattern, or a `constant` or `secret-input` field the page sent (`bad-value`);
- a step whose service the user isn't signed in to (`signed-out`).

It shall send nothing and answer `cancelled` when the user doesn't confirm an `admin` or `irreversible` step, or closes the secret dialog. It shall fill `constant` fields and the typed `secret-input` values itself and never hand a secret back. It shall send the route's method and path with each value as one percent-encoded segment, open a guided step's filled address, hand back only the route's kept fields that hold plain values, hand back a failed status with no fields and the service's message cut to 300 characters, and say when the service didn't answer.

The `FakeActionSender` in this package shall pass the suite and hold no token, so the stepper can be built before the shell's sender exists.

## Examples

- Given a sender signed in to GitHub,
  when it is asked to send step 2 of `github.approve-run` version 2,
  then it refuses with `not-in-catalog` and the service sees no call.
- Given a send whose `repo` value is `app/../../user` or `app%2Fx`,
  when it is sent,
  then it is refused with `bad-value` and the service sees no call.
- Given a body that holds the `secret-input` field `text`,
  when it is sent,
  then it is refused with `bad-value`.
- Given a user who doesn't confirm an irreversible step,
  when the step is sent,
  then the result is `cancelled` and the service sees no call.
- Given a user who types a secret for a Cloudflare worker secret step,
  when the step is sent,
  then the service sees the secret and the constant `type` in the body, and the result doesn't hold the secret.
