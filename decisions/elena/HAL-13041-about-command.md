# Decision: the served Studio's Ctrl K has no About Halonic, and the phone Settings headings are h2

- Task: HAL-13041
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13041 (findings K2 and S3 of the C117 check HAL-13023 of #3658; follows the approved `shell.settings-without-host` and `studio.served-settings`, no new words; team decision under the HAL-2282 rule; Liam's code review)
- Kind: user-visible

## What changes

Ctrl K lists **About Halonic** only where the window's `settingsSections` has About Halonic
(`about`). The served Studio leaves the host sections out until `halonic serve` gives it the
computer's settings, so its Ctrl K no longer offers About Halonic. Until now Enter on it opened
Settings at Appearance, because the About section isn't there. **Check for Halonic updates** and
**Restart to update Halonic** are unchanged: they still need an updater, which the served Studio
doesn't have.

The phone's Settings list page gives its group headings ("Acme · workspace settings", "On this
phone", "On your computer") as `h2`, straight under the page's `h1` "Settings", in the desktop
app and served alike. They were `h3`, which skipped a level for a screen reader.

## Why

`shell.settings-without-host` and `studio.served-settings` already say that Ctrl K offers no
command that opens a host section; About Halonic was the one command that still did, because it
came from the updater commands rather than the section commands. A heading level that skips h2
breaks the outline a screen reader user moves by (a11y checklist, headings).

## Covers

- settings.section-commands
- studio.served-settings
- shell.settings-list-page
- packages/studio/features/settings/src/updater/restart-flow.test.tsx
- apps/studio/src/studio/served-studio.test.ts
- packages/studio/shell/src/settings/settings-phone.test.tsx
