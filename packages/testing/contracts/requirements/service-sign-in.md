# contracts.service-sign-in

- Status: active
- Since: unreleased
- Source: Liam's approval of option (A) with conditions on HAL-17545 (conditions 1, 3 and 5); the architecture note on HAL-17491 (row 15 and section 6.7); requirement `ports.service-sign-in`; HAL-20265 (a sign-in never writes over a kept key)

Where an adapter implements `ServiceSignIn`, it shall pass this suite without network access, against a stand-in Paperclip, board and keychain. It shall read a connection file's address and company, and refuse to start a sign-in for a missing file (`no-connection`), for a host other than the file's (`other-host`), for a test on a connection that already has a key, including a keychain entry signed in from another workspace, and for any other sign-in over a kept key Paperclip still takes (`already-signed-in`), and keep that key; a sign-in that isn't a test over a key Paperclip no longer takes shall start. A started sign-in shall have a code, an approval page under `/cli-auth/` on the connection file's own address, and an expiry at most 10 minutes away. An approved sign-in shall end `signed-in` with the approver's name and keep the key. An aborted or cancelled sign-in shall leave no key in the keychain, including when the abort comes after the approval and before the follow answers. A finished test sign-in shall be revoked and removed from the keychain, and any other sign-in shall answer `not-a-test` and keep its key.

The `FakeServiceSignIn` in this package shall pass the suite and hold no key, so the stepper can be built before Studio's own sign-in is wired.

## Examples

- Given a connection file `acme` at `https://paperclip.acme.example`,
  when a sign-in starts for the host `paperclip.evil.example`,
  then it is refused with `other-host`.
- Given a followed sign-in that the board approved,
  when the stepper closes before the follow answers,
  then the follow answers `cancelled` and the keychain holds no key for `acme`.
- Given a finished test sign-in,
  when it is revoked,
  then it answers `revoked`, the keychain holds no key and who-am-I answers nobody.
- Given a keychain entry for `elsewhere` signed in from another workspace,
  when a sign-in starts for `elsewhere`, as a test or not,
  then it is refused with `already-signed-in` and the entry stays.
