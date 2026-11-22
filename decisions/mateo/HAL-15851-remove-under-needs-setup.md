# Decision: Settings offers Remove under Needs setting up while a removal kept access

- Approval: decided by the team under HAL-2282 (Mateo with Noah, option 2 on HAL-15850), the work is HAL-15851; Liam reviews it and signs this note as the CTO
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:I2OaEkLLa7bUHOVqmoaqc4PYDWbX4OFgag+UKVjj9Euf/KZ2Rf4Odhomy2FTLHBmw7PKrHpDQ1K9btqhHpDxCQ==

After a removal with administrator rights that kept some access to the
user's project folders (`keptAccess: "manual"`), Settings › Agent sandbox
showed **Needs setting up** with only **Set up the sandbox**, so its note
told people to set the sandbox up again only to remove it. Now the sandbox
check says `accessKept` while srt lists kept grants with its sandbox account
still there (port `Sandbox` v11, docs/adr/2026-11-22-sandbox-check-access-kept.md),
and `settings.agent-sandbox-state` changes: **Needs setting up** also offers
**Remove the sandbox…** then, outside served Studio. srt's own status is the
record, so it holds after a restart and after a removal from the CLI or the
uninstaller. A status that can't be read adds nothing.

The manual line goes back to Noah's round 1 steps in the current frame:
"…To end that, remove the sandbox again without administrator rights: quit
Halonic, open it again normally, not as administrator, then remove it here."
The uninstaller's line has moved on since HAL-15850 (install again, then
uninstall normally; HAL-16084 changes it again in #5036), so it stays.

## Covers

- settings.agent-sandbox-state
