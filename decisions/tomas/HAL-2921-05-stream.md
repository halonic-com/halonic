# Decision: a streamed error event gets the reason of its status, and streams have the size limit

- Requirements: `model-anthropic.stream-errors` (`packages/adapters/model-anthropic/requirements/stream-errors.md`), `model-anthropic.reply-size` (`packages/adapters/model-anthropic/requirements/reply-size.md`)
- Task: HAL-3561, from Liam's review of #984 (HAL-2921 part 5)
- Approval: Liam asked for both changes on HAL-3561; Liam approves this note in review
- Kind: internal

## What changes

`model-anthropic.stream-errors`: an `error` event in a stream no longer always ends with
`refused`. It gets the reason the status of its error type gets as a call error, from the types
Anthropic documents: `overloaded_error` (529) and `api_error` (500) are `provider-busy`,
`authentication_error` is `key-refused`, `billing_error` is `out-of-credit`, `not_found_error` is
`model-missing`. A type we don't know stays `refused`. The API's text moves from the message to the
error's `cause`, and is also checked against the call's key, as for a status. The example now says
`provider-busy`.

`model-anthropic.reply-size`: the 10 MiB limit covers streamed replies too, with an example for a
stream that never ends.

## Why

A 529 and an `overloaded_error` event mid-stream are the same overload. Studio shows a different
next step for `provider-busy` (try again) than for `refused`, so the same overload must not get two
reasons depending on when it arrived. Without a limit, a stream that never ends would grow the
answer without bound.

## Tests

No test was weakened or removed. The stream error cases now check the reason, the message and the
`cause` for each case; a new test checks, for every documented error type, that the streamed event
gets the same reason as its status. New tests cover the 10 MiB limit on a stream and an abort that
wins over a stream's error event.

## Covers

- model-anthropic.stream-errors
- model-anthropic.reply-size
