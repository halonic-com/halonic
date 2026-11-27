# Decision: the Studio takes the new design's theme values

- Task: HAL-20674
- Approval: Liam signs this note for HAL-20674 (build plan P1 on HAL-20617, approved). A team decision on an approved plan.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:QakXJlcsuyKeejdlzlMwgIUpFESx9VxIqtjaEc2RCUSNs2tQ75o075t9jdpjukZfnjVXVK67VA2vSyYzjGWLAA==

## What changes

The kit's surface, line and text colours in `packages/studio/kit/src/theme.css` move to the
new design's values in our blue's hue: in light a `#f3f5fa` frame with white panels, in dark a
`#0a1630` frame and sidebar with `#060d1d` panels. Token names stay; status colours stay Studio's.
Five tokens are added for new concepts: `--spacing-rail`, `--spacing-row`, `--radius-panel`,
`--ease-press` and `--ease-menu`. Every screen changes colour, so screenshot files change.

Two existing tests change with the values, neither weakened:

- "draws a focused app's frame in slate-75 …" (HAL-18691) now checks the new frame value.
- The list of agreed radius and spacing tokens names the three new ones.

The requirement `kit.new-design-theme` is added, with a contrast test for text and control edges on
every surface in light and dark.

## Why

The board approved the new design for the Studio (HAL-20617); this is phase P1 of its build plan.

## Covers

- kit.new-design-theme
- packages/studio/kit/src/theme.test.ts
- packages/studio/kit/src/theme-new-design.test.ts
