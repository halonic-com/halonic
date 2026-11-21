# Decision: the Android app may ship the phone pages and the kit, and nothing else of the Studio

- Task: HAL-15178
- Approval: the D7 design note on HAL-15159, section 4, signed by Liam (maintainer) and Julian (security, HAL-15181); Liam signs this note in review on HAL-15178
- Kind: internal

## What changes

`studio.entry` said the Android app "ships none of the Studio" (HAL-1253). It now says the app
ships none of the desktop Studio: only the phone pages of `studio-feature-remote/phone` and the
kit, and points to the new `studio.connect.bundle`. `studio.desktop-page` repeated the old
sentence and now says "none of the desktop Studio" too. Nothing else in either requirement
changes, and their tests are unchanged.

Two new requirements hold what D7 asks of the page: `studio.connect.bundle` (the connect page's
build fails when it takes in the shell, the engine, an adapter, the code editor or a desktop
feature, or grows past 800 KB) and `studio.connect.no-network` (the exact content security policy
of B7 item 4, in the built `connect.html` and in the policy Tauri sends on Android).

`pages-not-framed.test.ts` read "the Android config sets no policy of its own", because it then
inherited the desktop one with `frame-ancestors 'none'`. The Android config now sets the connect
page's policy, so that test now checks `frame-ancestors 'none'` in it directly. It keeps its two
tests and its expectations.

The CI path filter for the Android job (`.github/workflows/ci.yml`) adds
`packages/studio/features/remote/`, `packages/studio/kit/` and the one services file the page
uses, `packages/studio/services/src/tauri-ipc.ts`, because the APK ships them.

`@halonicjs/studio-services` gets a `./tauri-ipc` entry point (`tooling/check/policy.json`,
`extraExports`). The connect page imported `tauriIpc` from the package root, which pulled the
services' other modules, and with them parts of the Studio shell, an adapter, React and the
YAML parser, into the APK: 466 KB of script for a page that needs 7 KB. HAL-1253 was meant to
stop exactly that, and nothing checked it until now.

## Why

Liam decided on HAL-15151 that the phone's Studio pages ship inside the APK, and the D7 note
(HAL-15159) set how: only the phone pages, with a size limit and a guard, and no network for the
page. The old sentence would forbid the phone pages outright. This is internal: the connect
screens look and behave as before, and no wording a user reads changes.

## Covers

- studio.entry
- studio.desktop-page
- apps/studio/src/studio/pages-not-framed.test.ts
- .github/
- tooling/check/policy.json
