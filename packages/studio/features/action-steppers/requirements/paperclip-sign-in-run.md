# action-steppers.paperclip-sign-in-run

- Status: active
- Since: unreleased
- Source: HAL-17545 (approvals stream HAL-17488, PR 13), Liam's approval of option (A) with conditions 1, 3 and 4; architecture note on HAL-17491, row 15 and section 6.7; HAL-20265 (resume after a kept key, Julian's reviews of #6694 and #6695)

When the desktop app runs a request whose definition has `sign-in` steps, the stepper shall run each part from the run bar through `ServiceSignIn`, in the foreground, with no account needed first. Step 1 shall start the sign-in and show its code and a countdown that ends at the expiry the sign-in answered, at most 10 minutes after the start on the stepper's clock. Step 2 shall open exactly the approval page the sign-in answered and say "On the approval page, check the code matches this one, then click Approve." Step 3 shall wait for the approval until the key is in the keychain, then say "Signed in as <name>." Step 4 shall say who the key signs in as and, for a test sign-in, revoke the key it made. Once its time is up, the step shall fail with "The sign-in expired.", and the sign-in shall start again at step 1. Closing the stepper during step 3 shall cancel the wait and keep no key. A test sign-in on a connection that already has a key shall fail with "This connection is already signed in. Disconnect it first to test a new sign-in." The record shall keep steps 1 to 3 only once the key is kept. When the stepper opens again, a test sign-in whose step 4 isn't recorded shall show steps 1 to 3 as not done, because closing revoked its key, and any other sign-in whose steps 1 to 3 are recorded shall go on at step 4, so no second key is made. Where this Studio has no `ServiceSignIn`, the request shall show as not available here.

## Examples

- Given a test sign-in request for the `acme` connection on `paperclip.acme.example`,
  when step 1 runs,
  then the panel shows its code and "10:00 left to approve".
- Given step 1 ran 10 minutes ago,
  when step 2 runs,
  then it fails with "The sign-in expired." and step 1 is to do again.
- Given step 3 is waiting for the approval,
  when the stepper closes,
  then the wait is cancelled and the keychain holds no key.
- Given the board approved a test sign-in,
  when step 4 runs,
  then the test key is revoked, the keychain holds none, and the request is answered.
- Given a test sign-in whose key was kept in step 3, and a stepper closed before step 4,
  when the user opens the request again,
  then the stepper offers step 1, not step 4.
