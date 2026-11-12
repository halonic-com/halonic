# Decision: the Appearance follow-ups from the first pull request

- Approval: these follow-ups are part of HAL-7789, the T11 plan HAL-1294; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:zI6GeqPzGvh8kMTbUA9kYD09YtKelfcL0al89GYbJ7D/BXvelxKkGoKstZaFx712Kd7c9MXR+Az6AUjyHeHfDA==
- Task: HAL-7789

## What changes

`studio.window-appearance` gets one sentence and one example: on a page with no storage a save fails, so Settings says so and puts the value back.

`settings.appearance-section` gets two sentences and the full wording of the failed-save line for each control: a drag that never lets go (the dialog closes, the pointer is cancelled or the slider loses focus) puts the window back to the stored opacity, and the slider keeps the browser's own keys, with no Page Up or Page Down handling of its own. The agent characters line reads "Agent characters are back on." or "back off."

`kit.slider` gets one example: an optional `onEnd` is called when the pointer is cancelled or the slider loses focus, after `onCommit` when a value was saved.

Nothing else changes in these requirements, and no example was removed or weakened.

## Why

Follow-ups from the first Appearance pull request (#2147, HAL-7216): an abandoned drag must not leave the window at a value that was never saved, the agent characters line must read as a sentence, and a page without storage must not report a save that kept nothing.

## Covers

- studio.window-appearance
- settings.appearance-section
- kit.slider
- apps/studio/src/studio/start-studio.test.ts
- packages/studio/features/settings/src/appearance/appearance-section.test.tsx
- packages/studio/features/settings/src/display-settings.test.ts
- packages/studio/kit/src/slider/slider.test.tsx
