# agent-host.paperclip-sign-in

- Status: active
- Since: unreleased
- Source: HAL-17496 (split from HAL-17439 on HAL-17487); HAL-17942 (the hand-over's confirm); HAL-18048 (the hand-over's order); HAL-20278 (the shell keeps the key); sign-in test HAL-17423; ADR `docs/adr/2026-11-24-agent-messaging.md`, section Sign-in; `ports.paperclip-key`

When a Paperclip sign-in starts, the agent host shall start a challenge whose `command` is a new random phrase of 4 words, give Studio that same phrase and the approval page on the connection's own address, and keep the key Paperclip returns in its memory only, never in an answer, file or log. It shall end the sign-in as `expired` 10 minutes after it started, through a timer of the `Scheduler` port, and drop the key. When the sign-in is cancelled, or a poll says `cancelled` or `expired`, it shall drop the key, and on a cancel or a time-out it shall also cancel the challenge. When a poll says `approved`, it shall read `/api/cli-auth/me` with the key and, if the key's user belongs to the connection's company, hand the key with the connection's address and company to the keychain store; otherwise it shall refuse the key and revoke it. When the challenge's cancel says the board had already approved it, the agent host shall revoke the key; it shall also revoke an approved key that fails to be stored. Studio shall start a sign-in with the workspace and an address that is `https`, or plain `http` to this computer: for the connection file it names, which must have that address; otherwise for the file with that address; otherwise for a new connection named after the address's host, whose challenge carries no company and which takes the approver's company when `me` lists exactly one, and otherwise refuses and revokes the key. When the key is stored, the agent host shall write a new connection's file (label, address and company only), keep the key in memory for the workspace's connection and start its provider, and its answer to that poll shall hand the Studio shell the key once, with the connection's name, address and company and the workspace's real path (`agent-host.paperclip-key`); the shell keeps it and passes the page no key (`studio.src-tauri.paperclip-key-keep`). It shall hold that sign-in until the shell confirms its keychain has the key, and answer a repeated confirm the same way until one minute after the key was stored. When the shell or Studio cancels it before confirming, or doesn't confirm it within one minute after the key was stored, through a timer of the `Scheduler` port, the agent host shall revoke the key and remove the connection file the sign-in wrote; a file that was there before stays. A connection that held a key before the sign-in shall keep that key; any other shall forget the key and stop the connection's provider. The host shall take sign-in requests only from its own page. A sign-in shall send only the requests on its list (start, poll and cancel a challenge, read `me`, revoke the current key), and none of them shall reach `/api/board-api-keys`.

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
- Given a started sign-in the board approved before any poll saw it,
  when Studio closes the dialog or the 10 minutes pass,
  then the cancel says `approved` and the key is revoked.
- Given a started sign-in and no answer from the board,
  when 10 minutes pass,
  then the scheduler's timer ends it as `expired` and the key is dropped.
- Given a sign-in whose key the approved poll handed to Studio,
  when Studio doesn't confirm it within one minute,
  then the key is revoked and the host holds it no more.
- Given a key store that takes longer than one minute to store the key,
  when Studio doesn't confirm it within one minute after that,
  then the key is revoked.
- Given a sign-in Studio confirmed,
  when Studio confirms it again within the minute,
  then the host answers that it has the key, and the key isn't revoked.
- Given Sign in again on connection `acme`, which holds a key,
  when Studio cancels the sign-in because its keychain refused the new key,
  then the new key is revoked and `acme` keeps its old key.
- Given a new connection whose key the approved poll handed to Studio,
  when Studio cancels the sign-in because its keychain refused the key,
  then the key is revoked and `connections/paperclip/acme.yaml` is gone.
- Given a workspace with no connection file,
  when the board signs in at `https://paperclip.acme.test` and the approver belongs only to `acme`,
  then `connections/paperclip/acme.yaml` holds the label "Acme", the address and `acme`, and no key.
- Given a new connection whose approver belongs to `acme` and `globex`,
  when a poll says `approved`,
  then nothing is stored, the key is revoked and the sign-in ends as `wrong-company`.
- Given the address `http://paperclip.acme.test`,
  when Studio starts a sign-in,
  then the host refuses it as `address-not-allowed` and sends nothing.
