# routines.page.run-now-steps

- Status: draft
- Since: unreleased
- Source: HAL-12170; flow-routines 3.8

Where the host can offer them, a Run now refused because the account is signed out shall give the toast **Sign in with Google**, and one refused because the workspace isn't trusted shall open the workspace's one trust gate instead of a toast, and start the run when the person trusts it.

## Examples

- Given the host refuses because fin@acme.example is signed out, then the toast that stays has **Sign in with Google**, and pressing it starts that account's sign-in.
- Given the sign-in can't start, then a toast says "Couldn't start the sign-in for fin@acme.example." with the reason.
- Given the host can't sign in, then the toast has no step.
- Given the host refuses because the workspace isn't trusted, then the trust gate opens and no toast shows; when the person trusts it, the run starts.
- Given the person chooses Not now, then a toast that stays says "Not started: Daily isn't trusted yet."
- Given the workspace is still refused after it was trusted, then the gate doesn't open again and the toast says it isn't trusted yet.
