# contracts.fake-remote-control

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decision 13 (HAL-12232); task HAL-12235

The `FakeRemoteControl` shall be a `RemoteControl` that runs in the process, so Studio's Remote screens can be built and tested before the host's pairing service exists. It shall pass the `contracts.remote-control` suite. A test shall be able to play a phone that uses the code, tries a wrong code, connects and disconnects; add a paired phone without a pairing; move the tunnel, or make it fail to start with a reason; and make the host offer remote or not. A code shall end after 5 minutes and the wait for Allow after 2 minutes, by default, in simulated time that moves only when the test advances it, and 5 wrong tries shall end a code. A pairing that ends because the tunnel is down shall carry the tunnel's reason.

## Examples

- Given an open pairing,
  when the test advances the time by 5 minutes,
  then the pairing ends with `code-expired` and remote is off again.
- Given a pairing at `check`,
  when the test advances the time by 2 minutes,
  then the pairing ends with `allow-timed-out`.
- Given an open pairing,
  when a phone tries a wrong code 5 times,
  then the tries left count down from 4 and the pairing ends with `too-many-tries`.
- Given a fake told to fail its next start with `not-installed`,
  when a pairing is opened,
  then it ends at once with `tunnel-down` and `not-installed`, and remote is off.
- Given a paired phone that is connected,
  when it disconnects,
  then it is not connected and its last seen time is now.
- Given a host that doesn't offer remote,
  when remote is turned on or a pairing is opened,
  then the call rejects.
