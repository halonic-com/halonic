# Decision: Settings › Startup gets a second switch, Reopen windows on start

- Approval: the board asked for the switch on HAL-10 (HAL-19534: "Settings switch "Reopen windows on start", on by default"); Liam approved the plan on HAL-19566 and signs this note in review
- Kind: user-visible

`settings.startup-section` said the section holds one switch, **Start
Halonic when I log in**. Halonic now reopens every window open at the last
quit (`studio.src-tauri.open-windows`, #6505), and the board wants a switch
to turn that off, on by default. So the section holds a second switch,
**Reopen windows on start**, saved as the host setting
`windows.reopen-on-start`. The shell read `windows.reopenOnStart`, which no
page can save (host setting keys are lowercase words with dashes), so it
reads the new key; nothing was ever saved under the old one. Its failed save
and failed load reuse the Notifications section's lines.

The section still shows only where the app gives a login item, so the
desktop app on Linux has no switch and keeps reopening its windows, as when
nothing is saved.

No test is weakened or dropped; the section's tests gain the second switch.

`studio.src-tauri.open-windows` (a draft) names the switch, the new key and
the Dock, and says a content change writes the windows last noted without
reading them again.

## Covers

- settings.startup-section
