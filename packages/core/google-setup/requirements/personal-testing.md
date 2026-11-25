# google-setup.personal-testing

- Status: active
- Since: unreleased
- Source: HAL-18663 (design 2.3, 3.2 "Step 3 for personal accounts", 3.3 and 3.6; the board's choice on HAL-18554)

Where the account is a personal one, its app shall stay in *Testing* unless the user publishes it with their own pages. In *Testing*, `setupSteps` shall leave out step 4 and number the six other steps 1 to 6, and step 3 shall require the tick `test-user` and offer the account's address as the test user to copy. Published (`publishing: "production"`), step 3 shall require the tick `in-production` and step 4 shall be there, so there are seven steps. A Workspace account shall keep its seven steps and have no publishing. The setup records shall keep, for a personal account only, how its app is published, when the test-user tick was set and whether it uses another account's app; switching how the app is published shall open step 3 again, and going back to *Testing* shall clear the "In production" tick. A personal record with none of this yet shall read as *Testing*, or as published when it was ticked "In production". A second personal account that shares an app in *Testing* shall get steps 1, 2 and 4 to 6 done and step 3 open with only the test-user part and its tick, and an app in *Testing* can be shared only once its own address was ticked as a test user.

## Examples

- Given a personal account and one service, then the steps are `project`, `apis`, `consent`, `client`, `credentials`, `sign-in`, numbered 1 to 6, and step 3 requires `test-user` for `someone@example.com`.
- Given a personal account with `publishing: "production"`, then there are seven steps and step 3 requires `in-production`.
- Given a Workspace account, then there are seven steps and step 3 requires no tick.
- Given a personal record in *Testing* switched to published and back, then step 3 is no longer done and the "In production" tick is cleared.
- Given a second personal account sharing an app in *Testing*, then step 3 is the first step not done, with `parts` `test-user-only`.
