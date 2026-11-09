# shell.error-messages

- Status: active
- Since: 0.1.0
- Source: HAL-1846 (FS9, failure-states 4.1, microcopy 22 F13), HAL-1663

The shell shall turn a failed action's error into a message in one function, `errorMessageFor`, from the error's kind. The title shall be the screen's own "Couldn't…" sentence. A kinded error's message shall be the body when the screen gives nothing more specific. An `internal` error, which includes anything without a kind, shall never show its own message: its body shall be "Halonic ran into a problem it can't explain yet." with **Copy details**. A `conflict` shall offer **Load the latest** only when the item has no unsaved edits.

## Examples

- Given `KindedError("invalid_input", "Enter a whole number from 1 to 64.")`,
  when the shell words it,
  then the body is that message and there is no action.
- Given a `not_found` error for an agent,
  when the screen names the item as agent in Agents,
  then the body is "This agent isn't in this workspace any more." with **Go to Agents**.
- Given a `conflict` with an empty message and no unsaved edits,
  when the shell words it,
  then the body is "It was changed somewhere else since you opened it." with **Load the latest**.
- Given a `conflict` while the item has unsaved edits,
  when the shell words it,
  then there is no **Load the latest**.
- Given an `unauthenticated` error from Gmail (fin@acme.example),
  when the shell words it,
  then the body is "Gmail (fin@acme.example) is signed out." with **Sign in with Google**; for a served Studio's own login it is "You've been logged out of this Studio." with **Log in**.
- Given a `limit_reached` error from Anthropic that can be tried again in 90 seconds,
  when the shell words it,
  then the body is "Anthropic asked Halonic to slow down. Try again in 2 minutes." with **Try again**; for Halonic's own budget the action is **Change budget**.
- Given a `TypeError` whose message is a file path,
  when the shell words it,
  then the kind is `internal` and the path is nowhere in the message.
