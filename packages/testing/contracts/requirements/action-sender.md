# contracts.action-sender

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers, the board's decision on HAL-10, 24 Nov 13:01 UTC), the architecture note on HAL-17491 with Julian's finding on 2.4 (the sender binds every send to a reviewed step); ADR `docs/adr/2026-11-24-action-sender.md`; task HAL-17516; requirement `ports.action-sender`

Where an adapter implements `ActionSender`, it shall pass this suite without network access or a token of its own, against a stand-in service. It shall say which account is signed in to a service by name only, sign in and out, and tell a cancelled sign-in from a service it doesn't know. It shall refuse, and send nothing for, a step that isn't on its allow-list by definition, version and step; a placeholder value that is missing, extra, empty, `.` or `..`, or holds `/`, `\`, `?` or `#`; a body that isn't an object whose top-level fields are all on the step's list; and a step whose service the user isn't signed in to. It shall send the allow-list's method and path with each value as one percent-encoded segment, hand back only the step's kept fields that hold plain values, hand back a failed status with no fields and the service's message cut to 500 characters, and say when the service didn't answer.

The `FakeActionSender` in this package shall pass the suite and hold no token, so the stepper can be built before the shell's sender exists.

## Examples

- Given a sender signed in to GitHub,
  when it is asked to send step 2 of `github.approve-run` version 2, or of `github.delete-repo`,
  then it refuses with `not-in-catalog` and the service sees no call.
- Given a send whose `repo` value is `app/../../user`,
  when it is sent,
  then it is refused with `bad-value` and the service sees no call.
- Given a body with a field `admin` that isn't on the step's list,
  when it is sent,
  then it is refused with `bad-value` and the service sees no call.
- Given a `repo` value of `app one`,
  when the step is sent,
  then the service sees `POST /repos/acme/app%20one/actions/runs/123456/approve`.
- Given an answer with the fields `id`, `state`, `details` (an object) and `token`, and a step that keeps `id`, `state` and `details`,
  when the step is sent,
  then the result holds only `id` and `state`.
