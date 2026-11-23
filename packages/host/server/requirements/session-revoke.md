# server.session-revoke

- Status: active
- Since: unreleased
- Source: HAL-6702 (`DeployTarget.revokeSessions`); decided on HAL-16732

The sign-in shall offer `revokeAllSessions`, which ends every session at once without listing them. The server shall keep a session generation in the `Coordination` port as a value under `sessions:generation`: 16 random bytes as hex, never a counter. A revoke shall read the current value and replace it with a new one by compare-and-set, and shall take no lock; a lost race counts as done, because the revoke that won set a value just as new. A new session shall store the generation current when it starts, and none while no generation is set. A session shall count as signed in only while its generation equals the current one, a session without one counting only while none is set, and a session whose generation isn't text has ended. A session that has ended this way shall be deleted the next time it is shown, as after a password change. The check shall read the generation together with the session, so it adds no round trip.

Rationale: `Coordination` can't list or delete keys by prefix, so ending every session has to change what counts as live. A revoke is the emergency action after a leak, so it must still work while a stuck deploy holds the deploy lock. Sessions from before this change keep working until the first revoke.

## Examples

- Given a session started before any revoke, then it stays signed in until the first revoke, and its cookie answers 401 after it.
- Given a session started after a revoke, then it stays signed in, and the next revoke ends it.
- Given a stored session whose `generation` is the number `1`, then it has ended and is deleted.
- Given two revokes at the same time, then both finish, one new generation is left and every earlier session has ended.
