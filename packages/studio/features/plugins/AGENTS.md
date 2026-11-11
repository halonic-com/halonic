# @halonicjs/studio-feature-plugins

Owner: elena · Layer: studio · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The Studio side of plugins: what a trusted plugin's `ui` adds to Studio (settings, commands, cards and its panel), drawn by Studio, and the Library's Plugins tab.

This package may change only through tasks that name it. Its public API is `src/index.ts`, plus `src/api.ts` for other features;
everything else is internal.

## Commands

| Command                                                                                 | What it does                                                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm exec turbo run test --filter=@halonicjs/studio-feature-plugins -- --maxWorkers=2` | runs this package's tests (and the codegen they need)                      |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2`                    | lints the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2`  | tests the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run typecheck --concurrency=2`                                         | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- **Plugin text is untrusted.** Show it as React text only. Never `dangerouslySetInnerHTML`, never a link that isn't the kit's `ExternalLink`, and never let it choose a button's words, a colour, an icon or where something goes (design HAL-1739, section 8.4).
- **The Markdown reader stays small.** `src/text/markdown.ts` reads a fixed set of elements into data; anything new it reads needs a case in `plugin-result.never-html.test.tsx`.
