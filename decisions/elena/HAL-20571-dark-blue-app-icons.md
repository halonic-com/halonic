# Decision: the dark, all-blue app icons on Windows

- Approval: https://paperclip.ing/HAL/issues/HAL-20465
- Kind: user-visible

The board approved a new app icon set on HAL-20465 (27 Nov 2026, card "App icons: build the dark,
all-blue set?"): dark only, all in Halonic blue, one line of light on ink glass around a point of
light in the centre of the square, no symbol inside a ring any more. HAL-20571 builds it for the
Windows icons of Halonic, Messenger and Inbox. So `studio.app-icons` changes: on Windows an icon is
the app's icon from that set, drawn by `dark-blue-icons.mjs` (a port of the designer's
`icons-v4.mjs`, the same SVGs to the byte and the same pixels as the designer's export), and no
longer the kit's glyph in the brand ring. Each `.ico` holds the sizes the set is drawn at, 16, 20,
24, 32, 40, 48, 64 and 256 px: the designer drew no 30 and 36 px, and each size is drawn on its own
pixel grid, so they are not scaled from another size. Noah's hand-tuned 16 and 24 px images were for
the old set and go; the tuning mechanism stays. `icon.png` and `icon.svg` (macOS and Linux) and the
Studio's `AppLogo` keep the kit's glyphs for now; the in-app logos follow in their own task. The
test changes to match: the size list, and the Windows SVGs are checked against the new set (ink,
Halonic blue, no tile, none of the old ring or glyphs) instead of against the kit's glyphs, which
`icon.svg` still is.

## Covers

- studio.app-icons
- apps/studio/src/studio/app-icons.test.ts
