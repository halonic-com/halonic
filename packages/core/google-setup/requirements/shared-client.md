# google-setup.shared-client

- Status: active
- Since: 0.1.0
- Source: HAL-706 (build plan B1; design 3.6, last bullet)

When a personal account uses the app of another personal account, the setup records shall copy the other account's project ID, "In production" tick, client ID and client secret ref, and mark steps 1 to 6 done, so both accounts share one client secret. They shall refuse with `cannot-share`, writing nothing, when either account is a Workspace account, both are the same account, or the other app has no client ID, client secret, "In production" tick or sign-in yet. They shall also refuse it when the account already has its own client ID, client secret or sign-in, so no client secret is left without a record pointing to it. `usingClient` shall give every record that uses a client ref.

## Examples

- Given a personal account that is signed in with its own app,
  when a second personal account shares it, then the second record holds the same client ID and client secret ref, steps 1 to 6 are done, and step 7 isn't.
- Given two accounts that share a client and a third with its own, then `usingClient` gives the two.
- Given a Workspace account, or an app that hasn't signed in yet, then sharing throws `SetupRecordError` `cannot-share` and nothing is appended.
- Given an account that already has its own client ID, client secret or sign-in, then sharing
  throws `SetupRecordError` `cannot-share`, nothing is appended, and its own secret still has a
  record pointing to it.
