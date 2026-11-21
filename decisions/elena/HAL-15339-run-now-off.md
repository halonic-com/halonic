# Decision: the engine's Run now starts a routine that's off, as the window's engine does

- Task: HAL-15339
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15339 (row RT15 of Sofia's Routines UX check on HAL-15304; the behaviour the board approved in flow-routines 3.8 and HAL-119: Run now always works, Off only stops the automatic starts; Liam's code review signs this note)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:oMKW7EWqH7bTO6Btb0HzyuWGpPzQ0McVFWFDGdy1SXvp//FNM17TrkP3Er1O9P2NsAW//70xKIl95o9L7dGRDA==

## What changes

- `server.engine-routines`: Run now (`POST /api/routines/<key>/run`) no longer answers 409 `routine_off` for a routine that is switched off. It starts it the same way as one that is on and answers 201. The `routine_off` code, its server error and its place in `RoutineRunRefusal` are gone.
- `studio.remote-engine`: the example for a 409 on Run now no longer names `routine_off`. A 409 from the engine still fails as `conflict` with the engine's own sentence.

## Why

The board approved that Run now works on a routine that's off, and the window's own engine does that today. The background engine refused it, so once B1 connects that engine, Run now on an Off routine would have shown a "switch it on" toast. Nothing on `main` connects the background engine yet, so nobody sees a change today.

## Covers

- server.engine-routines
- studio.remote-engine
