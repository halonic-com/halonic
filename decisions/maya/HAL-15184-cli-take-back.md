# Decision: the CLI's lock holder takes back what an uninstall with administrator rights left

- Approval: the task asks for this change ([HAL-15184](/HAL/issues/HAL-15184), from Nina's C545 check on HAL-15153, case 8); it completes the design Liam approved for #4419 on HAL-5404
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:dBGftjg66ZlVZyDqMRTh3KABfRzSGHVp94dG1t78x1IXWKPOmw0bEfliPq8YP5pFAwMAHopN3Yv/uWxP64I5Bw==

#4419 made the holder of the profile's host lock take back the grants srt kept for this user when a removal with administrator rights left them (`sandbox-srt.forget-after-admin-removal`). Only Studio's agent host passed `takeBackOrphaned`. The CLI's harness sandbox also holds that lock and sweeps (#4127), but didn't pass it, so someone who uses only the CLI on Windows kept the grants until they ran `halonic sandbox setup` or opened Studio. That was a gap, not a choice: the requirement already says "a host that holds the profile's lock".

Now the CLI's lock holder passes it too, so its first session takes them back before the sweep, under the same conditions (only without administrator rights, a failure logged and tried again, sessions still open). A CLI process without the lock, and other systems, take nothing back. `cli.sandbox-kept-grants` says so; `docs/security/sandbox.md` names Studio and a `halonic` command that runs an agent.

## Covers

- cli.sandbox-kept-grants
