# Decision: Studio waits on the agent host for messaging changes instead of asking every 2 seconds

- Task: HAL-18773 (part B of HAL-18736)
- Approval: HAL-18736, where Liam approved the plan (25 Nov, 19:02 UTC), with a hard timeout of about 25 seconds and a test that one waiting request doesn't hold back another
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:+meNpe3ueELV1rZkMOm22TYlxIB2uTWCyduHMha03wJ0UbMVjo6rDfvSxfKC/KZhsNZJmNj66Z5oqqX7BZ0+Dg==

## What changes

`agent-host-client.agent-messaging` said Studio asks `POST /v1/messaging/changes` every 2 seconds.
It now says Studio asks with `wait: true` again as soon as the host answers, and the host holds
each call until a source changes or about 25 seconds pass (new requirement
`agent-host.messaging-changes-wait`). The rest of the requirement is unchanged.

Its `changes` test checked the 2 second wait with one `expect`. There is no wait to check now, so
that `expect` is gone; the test instead checks that the second look carries `wait: true`. The
new behaviour is covered by the host's tests under `agent-host.messaging-changes-wait`.

## Why

A change on the agent host reached Studio up to 2 seconds late, and Studio asked the host 30
times a minute when nothing changed. With the long poll a change reaches Studio within one tick,
and an idle chat asks about twice a minute.

## Covers

- agent-host-client.agent-messaging
