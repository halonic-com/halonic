# sign-in-loopback.sign-in-launcher

- Status: active
- Since: unreleased
- Source: HAL-11618 (HAL-8613, HAL-984 design, section 4)

The sign-in launcher shall start the loopback server when a sign-in begins, start the flow on its port, open the browser at the provider and keep the server only while a sign-in waits: it stops after the callback came, after a cancel and after the lifetime. A sign-in the flow refuses shall start nothing and give the flow's reason.

## Examples

- Given a sign-in that the user approves at the provider,
  then the callback reaches the flow through the server, the flow's outcome is "signed in" and the server is stopped.
- Given a user who denies, then the outcome is the flow's and the server is stopped.
- Given a sign-in the sheet doesn't have, then the answer is `refused` with the flow's reason, no browser is opened and no server runs.
- Given a browser that can't be opened, then the sign-in is still pending and the answer says `opened: false` with the address.
- Given a cancel, or a sign-in left past its lifetime, then the callback gets the flow's 400 or nothing answers, and the server is stopped.
- Given a second `begin` for the same sign-in, then the first one's link no longer works.
