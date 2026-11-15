# Screenshots of Studio from CI

A reviewer without a browser can still see what a Studio change looks like. CI's `e2e` job takes
a screenshot of each screen in light and dark and uploads them. Nobody has to run Studio locally.

## Get the screenshots

1. Open the pull request's checks and find the **Studio end-to-end (Playwright)** job.
2. Download the `studio-screenshots` artifact from the run's summary page, or run
   `gh run download <run-id> --name studio-screenshots`.
3. The files are named `<screen>-<state>-<light|dark>.png`, for example
   `run-card-waiting-dark.png`. They are full-page, 1440 × 900.

The artifact is kept for 7 days and is uploaded even when a test fails. The screenshots are only
looked at: no test compares them with an earlier picture.

## Add a screen

The screens of a feature live in that feature, because the shell can't import a feature. The run
card is the first: `packages/studio/features/workflows/e2e`.

1. Add a page in `e2e/pages` that draws the screen from static data, as `run-card.tsx` does. The
   page takes its state from a query parameter, and has no `data-theme`, so it follows the colour
   scheme the spec sets.
2. Add the page to `vite.config.ts`.
3. In `e2e/screenshots.spec.ts`, add a loop like the run card's. Check that the screen is shown,
   then call `page.screenshot` with `fullPage: true` and a path
   `test-results/screenshots/<screen>-<state>-<light|dark>.png`.

Don't run Playwright on the shared runner (HAL-2418). Push and let CI run it. See
[the shell's README](../../packages/studio/shell/README.md) for the shell's own end-to-end tests.
