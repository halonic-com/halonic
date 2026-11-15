# Decision: Settings › About follows microcopy 20.6, including the Scoop switch

- Requirement: `settings.about-section` (`packages/studio/features/settings/requirements/about-section.md`)
- Task: HAL-9857 (design check on HAL-9835)
- Approval: Liam approves this note in review on the review task of HAL-9857
- Kind: user-visible

Microcopy 20.6 gives a Scoop install the switch **Tell me when a new Halonic is out**, on by default, with its own sentence, and a status line "Checks for new versions are off." The note of HAL-9371 said "no switch (spec 20.6)"; that was wrong, and the About section now shows the switch. The Scoop block now reads as 20.6 gives it (heading, sentence, command box), Check now announces "Halonic 0.1.1 is out. You have 0.1.0." on Scoop, the Restart to update button is primary and Cancel download ghost, a served Studio shows "Halonic" and its version, and the "didn't install" toast stays until closed with both **Try again** and **Open release page**. The copy hint now says "Select the command and copy it." Nothing the requirements said before was removed except "no switch", and no test was removed.

The words are the ones the approved microcopy already gives; this brings the page in line with it.

## Covers

- settings.about-section
- settings.restart-flow
- kit.copy-button
