# Decision: the Scoop wording in About Halonic and the status bar

- Task: HAL-1295
- Approval: HAL-9883 (Liam reviews this note with the pull request)
- Kind: user-visible

## What changes

When Scoop manages updates, About Halonic shows the switch **Tell me when a new Halonic is out**
in place of **Update Halonic automatically**, words an available update as "Halonic 0.1.1 is out.
You have 0.1.0.", and says "Checks for new versions are off." when the switch is off. The status
bar shows a short item that tells the user to run `scoop update halonic`, with the full line as a
tooltip from 900 to 1199px. The shell checks Scoop's manifest once a day only while the switch is
on; before, it checked whatever the setting said.

## Why

A Scoop user has no download to switch on, but still chooses whether Halonic tells them about new
versions. The switch has to decide, or it does nothing.

## Covers

- settings.about-section
- settings.restart-flow
