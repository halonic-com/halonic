# Decision: rename the kit's theme requirement and test to neutral names

- Task: HAL-20716
- Approval: Liam signs this note for HAL-20716 (board request on HAL-10: no reference app names in the code base). A rename, fast-track.
- Kind: internal

## What changes

The theme requirement from HAL-20674 is renamed to `kit.new-design-theme`; its file and its test file
are renamed to match, with the same text and checks. Comments in `theme.css` and one test title
describe the design in our own words. The HAL-20674 decision note and changeset are renamed too.
No value, check or behaviour changes.

## Why

The board's rule: our code bases never name the app the design was modelled on.

## Covers

- kit.new-design-theme
- packages/studio/kit/src/theme.test.ts
- packages/studio/kit/src/theme-new-design.test.ts
