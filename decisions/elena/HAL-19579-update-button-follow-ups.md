# Decision: one way into an update, and a quieter Update available dialog

- Requirement: `settings.restart-flow` (`packages/studio/features/settings/requirements/restart-flow.md`), `settings.update-dialog` (`packages/studio/features/settings/requirements/update-dialog.md`)
- Task: HAL-19579 (the visual check of #6433 on HAL-19551, step 4 of the HAL-19364 plan; a team decision, no board card)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19579
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:GBWTKOAFvczaVDuLwUvFG8RH+nrTmenEK32E8ZSsC8kXFNUGJbMDHCDXi6nkO2WsrJ885NcsuU+iTkg+hTtOAA==

Once an update was downloaded, two buttons offered it with the same icon: the status bar's
**Restart to update**, which restarted at once, and the title bar's new **Update**, which opened the
dialog. The visual check keeps the title bar's **Update** as the one way in.
`settings.restart-flow` now says the status bar shows no update item for an update Studio installs
itself; the Scoop item, About Halonic's **Restart to update**, Ctrl K's **Restart to update
Halonic** and the restart dialog stay as they were. In `restart-flow.test.tsx` the test "shows
Restart to update only while an update is ready, with a name that says the version" becomes "shows
no Restart to update in the status bar: with a ready update, only the title bar's Update". The four
tests that pressed the status bar item to start a restart ("restarts at once when no run would
stop", "asks first when runs would stop…", "repeats the whole request on Try again…", "ignores a
second press while the first is still counting runs") now press Restart to update through the
restart flow, which the Update dialog, About Halonic and Ctrl K all call; what they check is
unchanged.

`settings.update-dialog` no longer shows a "Halonic 0.1.1" heading over the state line, which
already names both versions, and leaves What changed out when it knows neither notes nor a release
page, instead of pointing at a page it doesn't have. Its tests gain checks for both; no test was
removed or weakened.

## Covers

- settings.restart-flow
- settings.update-dialog
- packages/studio/features/settings/src/updater/restart-flow.test.tsx
