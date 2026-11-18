# Decision: label the Formats example, show today's date, widen the select

- Task: HAL-11796
- Approval: Liam approves this change on HAL-11796 (https://paperclip.halonic.com/HAL/issues/HAL-11796), for HAL-11796. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jqfoQjwvDH+RONM74LSu0Ix3Yiu8wBGEmWnl/IrMgQ5Cw2966cvvTRkKmvi3kV4fb0ocHyNlCgTq0PZ9pxJ8Cg==

## What changes

The sample line under Settings › Formats now reads "Example: 12,345.60 · Tue 17 Nov, 08:00". It uses today's date and a number with a thousands separator, so the difference between formats shows. The Format select is wider, so "Follow this computer: English (United Kingdom)" isn't cut off.

The requirements `settings.formats-format` and `settings.formats-section` are updated to say this. The example values in their tests change to match; no test was weakened or skipped.

## Why

Found in the usability walk-through HAL-11771: the select text was cut off, and the sample line gave no hint that it shows how numbers and dates will look. The date was a fixed 9 Nov.

## Covers

- settings.formats-format
- settings.formats-section
- packages/studio/features/settings/src/formats/format-pref.test.ts
- packages/studio/features/settings/src/formats/formats-section.test.tsx
- packages/studio/features/settings/src/settings-services.test.tsx
