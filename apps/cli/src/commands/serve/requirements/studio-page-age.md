# cli.commands.serve.studio-page-age

- Status: active
- Since: unreleased
- Source: HAL-13710 (found in the real-run QA pass on HAL-13704); `cli.commands.serve.serve`

When the built Studio page is there but older than its sources, the `halonic serve` command shall still serve it, and print the line "The Studio page was built before its code last changed, so the address may show an older page. Build it again with: pnpm --filter @halonicjs/app-studio build" under the "Serving" line, where the line for a page that isn't built would be. A source is a file in `src`, other than a test, or the `package.json`, of the Studio app (`apps/studio`) or of a workspace package it uses, directly or through another, and the app's `studio.html` and `vite.config.ts`. It is older when one of them changed after the page's `studio.html` was written. The check compares file times only, builds nothing, and says nothing when a folder can't be read.

Rationale: `serve` reads the page where the Studio's build leaves it and has no build step of its own, and updating a clone (`git pull`, `pnpm install`) doesn't build the page again. Without the line, a newer server serves an older page without a word, and a screen whose server part changed shows wrong or empty, as Settings did on HAL-13704.

## Examples

- Given a built Studio page and a file in the Studio app's `src` changed after it was built, when `halonic serve` starts, then it serves the page and its third line says the page was built before its code last changed and how to build it again.
- Given the same page after `pnpm --filter @halonicjs/app-studio build`, when `halonic serve` starts, then it prints no such line.
- Given a file changed in the `src` of a workspace package the Studio app uses through another one, then the page counts as older.
- Given only a test file changed, or a file of a package the Studio app doesn't use, then the page doesn't count as older.
