# agent-host.paperclip-sign-in

- Status: active
- Since: unreleased
- Source: HAL-17496 (split from HAL-17439 on HAL-17487); sign-in test HAL-17423; ADR `docs/adr/2026-11-24-agent-messaging.md`, section Sign-in; `ports.paperclip-key`

When a Paperclip sign-in starts, the agent host shall start a challenge whose `command` is a new random phrase of 4 words, give Studio that same phrase and the approval page on the connection's own address, and keep the key Paperclip returns in its memory only, never in an answer, file or log. It shall end the sign-in as `expired` 10 minutes after it started, through a timer of the `Scheduler` port, and drop the key. When the sign-in is cancelled, or a poll says `cancelled` or `expired`, it shall drop the key, and on a cancel or a time-out it shall also cancel the challenge. When a poll says `approved`, it shall read `/api/cli-auth/me` with the key and, if the key's user belongs to the connection's company, hand the key with the connection's address and company to the keychain store; otherwise it shall refuse the key and revoke it. A key approved after its sign-in was cancelled or timed out, or one that fails to be stored, shall be revoked. A sign-in shall send only the requests on its list (start, poll and cancel a challenge, read `me`, revoke the current key), and none of them shall reach `/api/board-api-keys`.

## Examples

- Given a sign-in for company `acme`,
  when it starts,
  then the challenge's `command` is the phrase Studio gets, and the keychain store has nothing.
- Given a started sign-in,
  when a poll says `approved` and `me` lists `acme`,
  then the key is stored with the connection's address and company.
- Given a started sign-in,
  when a poll says `approved` and `me` lists only `globex`,
  then nothing is stored, the key is revoked and the sign-in ends as `wrong-company`.
- Given a started sign-in,
  when Studio closes the dialog,
  then the key is dropped and the challenge is cancelled.
- Given a started sign-in and no answer from the board,
  when 10 minutes pass,
  then the scheduler's timer ends it as `expired` and the key is dropped.
