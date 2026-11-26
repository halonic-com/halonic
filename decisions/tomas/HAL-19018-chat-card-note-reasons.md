# Decision: chat cards say why an option is missing; a secret proposal's Reject asks why

- Task: HAL-19018
- Approval: Sofia's words and accessibility check of #6270 and #6273 on HAL-19015 asked for both changes and set their words on HAL-19018; Liam reviews this change on HAL-19018.
- Kind: user-visible

## What changes

`messenger.option-note` gains one sentence: when a chat card leaves out an option that needs a
note, the card says so under its options ("Request changes needs a note: choose it in your
Inbox.") instead of "Also in your Inbox…". The option is still left out, as before.

`paperclip-client.board-requests` gains one sentence: a secret proposal's Reject takes an
optional note labelled "Why are you rejecting this?". A join request's Reject still takes none.
The request bodies don't change: a reject with a note already sent it as the reason, and one
without still sends "Rejected in Halonic.".

No test was skipped, weakened or removed; each requirement gains tests and an example.

## Why

A card that drops Request changes without a word, or shows Approve alone because Reject needs a
reason, pushes a person toward approving. And the agent whose secret proposal was rejected never
learned why, though Paperclip passes the reason on.

## Covers

- messenger.option-note
- paperclip-client.board-requests
