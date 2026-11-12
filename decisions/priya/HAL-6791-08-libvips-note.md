# Decision: the miniflare entry records that sharp's prebuilt libvips is LGPL

- Task: HAL-6791 (cloud part 1, the workerd test harness for the port contract suites)
- Approval: Liam asked for this note in his review of #2064 on [HAL-7293](/HAL/issues/HAL-7293); he approves this note in review
- Kind: internal

## What changes

The `reason` of the `miniflare` entry in `tooling/check/dependencies.json` gains one sentence: sharp, which miniflare brings, is Apache-2.0, but its prebuilt libvips binaries (`@img/sharp-libvips-*`) are LGPL-3.0-or-later. No rule, category, package list or layer changes.

## Why

miniflare is a dev-only tool in `@halonicjs/target-cloudflare-testing`. We never ship, bundle or modify libvips, so the LGPL puts no duty on us. Writing it down in the entry means anyone who later widens where miniflare (or sharp) may be used sees the licence first.

## Tests

No test was weakened or skipped. The change is to free text, and the `tooling/check` tests pass unchanged.

## Covers

- tooling/check/
