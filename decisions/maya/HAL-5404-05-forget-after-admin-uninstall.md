# Decision: take back the kept grants an uninstall with administrator rights left

- Approval: the task asks for this change (HAL-5404, condition S2 from the HAL-5407 review); the design is Owen's call on HAL-14806, changed after Liam's security review on HAL-5404; Liam approves this note in review on HAL-5404
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:u+hYePsau9IJ0rHQzYxNF8LOI39YVkI6G6LSoqqQyR88AF5fdcb8NYPyxAV6kc5n4mUGOnpXKA514GQOCtepAw==

## What changes

A removal of the Windows sandbox that runs with administrator rights still skips the user's kept grants (HAL-7544), and still writes nothing of its own for them. The next agent host that holds the profile's lock and runs without administrator rights takes back every grant srt kept for that user (`profile forget`, `acl forget --all`) before its sweep and its first session, when `srt-win user status` lists kept grants while the sandbox account is gone: exactly the state such a removal leaves. A setup does the same first, in the user's own process, because a new sandbox account would make that state disappear. A failure is logged and doesn't stop sessions or the setup; the grants stay listed, so the next start tries again. The removal's log line says the grants go at the next start only when srt shows that state, and keeps the `srt-win acl forget --all` fallback. New requirement `sandbox-srt.forget-after-admin-removal`; `agent-host.sweep-lock` says only the lock's holder takes them back at the start.

## Why

S2 says the removal takes back the kept grants whatever Halonic's record says. A normal uninstall does, but one that runs elevated (a silent uninstall from an elevated prompt, "Run as administrator") can't: `acl forget` changes access lists on paths from the user's own srt store, which the user's programs can write, so an elevated process must never run it. Running it later, as the user, closes the gap without that risk.

The first version left an empty mark file in the profile for the next start. Liam's review found that on Windows `openSync(path, "wx")` follows a dangling link and creates its target, so an elevated process writing in a folder the user controls could be made to create a file elsewhere; checking first doesn't help, because the link can be swapped in after the check. So the elevated removal now writes nothing in the profile, and srt's own status is the only trigger.

Owen's conditions (HAL-14806), and how they are met:

1. Nothing is read from or written to the profile for this. The trigger is srt's status, read with `user status`; a faked status can only start a `forgetAll` the user could run themselves.
2. The same trigger covers a removal from another administrator account.
3. A host with administrator rights, or one that can't tell, takes nothing back and logs why.
4. At the start it runs inside `sweepOnce`, only for the holder of the profile's host lock, before the sweep, and the first `open` waits for it.
5. A failure doesn't block sessions or the setup. That is safe because a sandbox set up again is a new `srt-sandbox` account: Windows never hands out a relative ID of a local account again, so its SID is new and the old grants, which name the old SID, give new sessions nothing.

## Known gap

A silent elevated uninstall has no done page, and if Halonic is never started again as that user, the grants stay until the user runs `srt-win acl forget --all`. That is acceptable for a per-user install; `docs/security/sandbox.md` says so. If the sandbox is set up again from outside Halonic (`srt windows-install` by hand) before Halonic starts, the old grants stay too, harmless for the reason in condition 5. The uninstaller's done-page sentence for the interactive case follows in its own pull request once its wording is decided (team decision, Noah).

## Covers

- agent-host.sweep-lock
