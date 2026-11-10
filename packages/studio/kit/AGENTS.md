# @halonicjs/studio-kit

Owner: noah · Layer: studio · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The Studio's design tokens (one theme.css) and, later, its shared base components.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                              | What it does                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                        | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/studio-kit` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- `src/theme.css` and the files it imports are the only place a colour, size, radius, shadow or
  duration is written. A missing value becomes a new token in `theme.css`, never a one-off in a
  component.
- Every colour is `light-dark(light, dark)`. Never add `dark:` classes or a second dark copy.
- Never import from another Studio package. The shell and features depend on the kit, not the
  reverse; `src/boundaries.test.ts` enforces it.
- Motion: colour changes and short fades only. No slides, scaling or moving dots; the busy spinner
  is the one exception.
- Changing a token list or a contrast pair in `src/theme.test.ts` is a design decision: say why in
  the pull request.
