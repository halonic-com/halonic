# Decision: take back the kept grants an uninstall with administrator rights left

- Approval: the task asks for this change (HAL-5404, condition S2 from the HAL-5407 review); the design is Owen's call on HAL-14806; Liam approves this note in review on HAL-5404
- Kind: internal

## What changes

A removal of the Windows sandbox that runs with administrator rights still skips the user's kept grants (HAL-7544), but now leaves an empty mark, `agent-host/forget-pending`, in the profile it was given. The next agent host that holds the profile's lock and runs without administrator rights takes back every grant srt kept for that user (`profile forget`, `acl forget --all`) before its sweep and its first session, when the mark is there or when `srt-win user status` lists kept grants while the sandbox account is gone. Only a success takes the mark away; a failure is logged and tried again at the next start, and doesn't stop sessions. New requirement `sandbox-srt.forget-after-admin-removal`; `agent-host.sweep-lock` says the lock's holder is the one that gets the mark.

## Why

S2 says the removal takes back the kept grants whatever Halonic's record says. A normal uninstall does, but one that runs elevated (a silent uninstall from an elevated prompt, "Run as administrator") can't: `acl forget` changes access lists on paths from the user's own srt store, which the user's programs can write, so an elevated process must never run it. Running it later, as the user, closes the gap without that risk.

Owen's conditions (HAL-14806), and how they are met:

1. The mark only triggers. It is created new and empty (`wx`), so an elevated removal never writes through a file or link already there, and nothing is ever read from it. A faked mark can only start a `forgetAll` the user could run themselves.
2. `user status` (kept grants, no sandbox account) is a second trigger, for a removal from another administrator account, whose mark lands in that account's profile.
3. A host with administrator rights, or one that can't tell, leaves the mark and logs why.
4. It runs inside `sweepOnce`, which only the holder of the profile's host lock gets, before the sweep, and the first `open` waits for it.
5. A failure keeps the mark and doesn't block sessions. That is safe because a sandbox set up again is a new `srt-sandbox` account: Windows never hands out a relative ID of a local account again, so its SID is new and the old grants, which name the old SID, give new sessions nothing.

## Known gap

A silent elevated uninstall has no done page, and if Halonic is never started again as that user, the grants stay until the user runs `srt-win acl forget --all`. That is acceptable for a per-user install; `docs/security/sandbox.md` says so. The uninstaller's done-page sentence for the interactive case follows in its own pull request once its wording is decided (team decision, Noah).

## Covers

- agent-host.sweep-lock
