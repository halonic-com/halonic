# Decision: on a phone, a Settings page's own headings sit one level under its h1

- Task: HAL-13401
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13401 (finding SH1 of the C180 check HAL-13384, and row RE3 of Sofia's C375 check HAL-14418 for Remote; same rule as S3 in HAL-13041, no new words; team decision under the HAL-2282 rule, Sofia as designer; Liam's code review)
- Kind: user-visible

## What changes

On a phone, Settings › a section opens as its own page with the section's name as its `h1`. The
section's own headings now sit one level under it:

- **Assistant:** Assistant model and Answers are `h2` (were `h4`), and so is "Couldn't load the
  Assistant settings".
- **Plugins:** Installed on this computer and Built in are `h2` (were `h4`), and No plugins yet is
  `h3` (was `h5`).
- **Trusted sources:** "Couldn't load trusted sources" is `h2` (was `h4`).
- **About Halonic:** the version ("Halonic 0.1.0") is `h2` (was `h3`) and Updates are managed by
  Scoop is `h3` (was `h4`).

The Settings dialog on the desktop keeps its levels (`h3` section › `h4`, About's version `h3`).
Remote's list heading there moves from `h3`, the same level as the section's name, to `h4`.
The headings look the same as before on both. The shell gives sections `sectionHeadingLevel(surface)`
for the level.

## Why

A screen reader's heading list showed the page jumping from `h1` to `h4`, and "next heading at
level 2" found nothing (WCAG 1.3.1, a11y checklist, headings).

## Covers

- shell.settings-list-page
- packages/studio/shell/src/settings/settings-groups.test.ts
- packages/studio/features/settings/src/assistant/assistant-section.test.tsx
- packages/studio/features/settings/src/updater/about-section.test.tsx
- packages/studio/features/plugins/src/list/plugins-settings-section.test.tsx
- packages/studio/features/workspace/src/trusted-sources/trusted-sources-section.test.tsx
- packages/studio/features/remote/src/settings/phone-list.tsx
- packages/studio/features/remote/src/settings/phone-list.test.tsx
- packages/studio/features/remote/src/settings/remote-section.test.tsx
