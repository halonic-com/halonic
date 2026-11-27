# Decision: Studio's frame takes the Messenger's colour, and Settings loses Frame colours

- Task: HAL-20499
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20499 (the board chose option B on its card, 27 Nov 2026, 09:41 CET)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:TAxarsooFN0n/63Sb9vjjNa2Iwl7GpiRWHCPE+8mcUhK9ZRkPh6YqY9X7Y6vXd2K1fDiJKO7+08zkay9I3xfDA==

## What changes

- `shell.frame`: on the desktop, Studio's title bar and sidebar sit on the app
  frame the Messenger and the Inbox have (`--color-app-frame`: slate-75 in
  light, slate-950 in dark), not on the halo.
- `studio.window-title-bar-colour`: Studio's window sends the shell the same
  `--color-app-frame` a focused app's window sends, so its title bar matches the
  Messenger's. The halo-start mix and its example go.
- `settings.appearance-frame-colours` and `settings.appearance-own-colours` are
  retired: Settings → Appearance no longer has Frame colours or Your own.
- `settings.appearance-section`: Appearance no longer sets the halo colours, so
  the highlights (the current sidebar item, the active tab's line, the logo, the
  start screen's glow) keep the kit's blue and purple, whatever an earlier
  version stored. One example is added.

Deleted with the setting: `frame-colours-field.test.tsx` (its field is gone),
the frame-colours tests in `apply-appearance.test.ts`, and the halo-start and
`mixOver` tests in `frame-colour.test.ts` (that code is gone). New tests: the
desktop frame draws `bg-app-frame` and not `bg-halo-frame`, and stored frame
colours no longer set the halo.

## Why

The board asked for Studio to have the same frame colour as the Messenger
(HAL-10, 27 Nov 2026). With the Messenger's frame, Frame colours would only
have tinted a few highlights under a name that no longer fits, so the board
chose to remove the setting rather than keep or rename it (options A and C on
the card).

## Covers

- shell.frame
- studio.window-title-bar-colour
- settings.appearance-frame-colours
- settings.appearance-own-colours
- settings.appearance-section
- packages/studio/features/settings/src/appearance/frame-colours-field.test.tsx
- packages/studio/features/settings/src/appearance/apply-appearance.test.ts
- apps/studio/src/studio/frame-colour.test.ts
