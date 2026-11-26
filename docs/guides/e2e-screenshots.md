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

## Settings and the Agents list

`settings-<section>-<light|dark>.png` shows Settings open on Models, Trusted sources, Agent sandbox,
Formats or Plugins (HAL-11861). It is the shell's real Settings dialog with the real section views,
fed made-up data, so the spacing under each section's name is the app's. The Agents list is
`agents-list-two-groups-<light|dark>.png`. Other features' views reach the pages through a
`load…` function in their `api.ts`, which loads the view only when called. The phone's Settings
sheet isn't taken yet.

## Agent map

`agent-map-<light|dark>.png` is an agent's page on Flow, with a card on each side of the map, from
made-up agents (HAL-13180). `agent-map-phone-<light|dark>.png` is the same page on a 360 px phone,
where the map is three narrow columns. The unit tests fake the map panel's size, so
`e2e/agent-map.spec.ts` also fails when the panel has no room, a card sits outside it, or a phone
card is under 48 px high. The page loads through
`loadAgentScreen` in the agents feature's `api.ts`.

## Welcome

`welcome-<new|recent|failed>-<1440|360>-<light|dark>.png` shows the shell's real Welcome screen
brand-new, with five Recent rows, and after a Recent row failed to open (HAL-11985). The spec also
checks that the title and **Open folder** sit at the same y in all three states.

## Plugins

`plugins-<step>-<light|dark>.png` are the plugin screens (HAL-1740), taken by the plugins feature's
own `e2e/screenshots.spec.ts` while it walks its flow page: Settings › Plugins with nothing
installed (`empty`), the Add plugin dialog (`add`), the trust check (`trust-check`), the list with
the plugin on (`on`), the command dialog with its Result (`command-result`) and the Remove dialog
(`remove`). `e2e/pages/screens.tsx` draws the screens the flow doesn't reach, from made-up data:
the plugin's page on, not trusted yet and can't load (`page-on`, `page-not-trusted`,
`page-cant-load`), its panel (`panel`) and its cards in each state (`cards`). CI uploads them
from `packages/studio/features/plugins/test-results/screenshots`.

## Allow this address?

`allow-address-dialog-<light|dark>.png` is the Models feature's "Allow this address?" dialog over
the run that asks it, and `allow-address-waiting-<light|dark>.png` is that run's step showing
**Waiting for your answer** without the dialog (HAL-15873). `allow-address-dialog-640.png` and
`allow-address-dialog-320.png` are the dialog at 200 % zoom and in a 320 px wide window, where the
page uses the phone layout as the app does and the buttons stack. The page loads the dialog through `loadAllowAddressDialog` in the models feature's `api.ts`.
`e2e/allow-address.spec.ts` also checks row X-5 of the dialog's UX checklist: its text has 4.5:1
contrast and its focus ring 3:1 in both colour schemes, and with "more contrast" set its button
edges 3:1 too, as the kit promises there. It measures the colours the browser drew
(`e2e/contrast.ts`). At both narrow sizes nothing scrolls sideways, no text is cut and both
buttons can be reached.

## Spend and seats

`spend-and-seats-<glance|loading>-<1440|390>-<light|dark|high-contrast>.png` is the Team feature's
Spend and seats screen from a made-up team: a budget at 92 %, runs not priced yet, and a seat in
each state, at a glance and while its first read is loading (HAL-17853). The spec also checks that
nothing scrolls sideways on the 390 px phone. The page loads the screen through
`loadSpendAndSeatsScreen` in the team feature's `api.ts`.

## Pull requests

`pull-requests-<attention|all-open|old|loading|failed|no-snapshot|no-access>-<1440|390>-<light|dark|high-contrast>.png`
is the Team feature's Pull requests screen from a made-up repo, for the design check against
HAL-17515's P1–P10 (HAL-18328): stuck PRs and those coming up, All open by state, an old snapshot,
loading, a failed first read, no snapshot and no access. The spec also checks that nothing scrolls
sideways on the 390 px phone. The page loads the screen through `loadPullRequestsScreen` in the
team feature's `api.ts`.

## A run at a plan limit

`plan-limit-<waiting|reserve>-<1440|390>-<light|dark>.png` is the Inbox card of a made-up run
waiting at its customer's plan limit, as flow C3 and board 10 word and draw it (HAL-19051): this
month's usage used up, and a step that needs more agent time than is left. The spec also checks
that nothing scrolls sideways on the 390 px phone. The page draws the card through `PlanLimitCard`
in the Inbox feature's `api.ts`.

## Pictures for halonic.dev

`e2e/site-screenshots.spec.ts` takes the pictures the website shows (HAL-10732): the run page of a
made-up Review pull request run (`run-steps-light.png`, `run-steps-dark.png`) and the Inbox card
"Publish the review?" (`approval-light.png`, `approval-dark.png`). They are in the same artifact,
but cropped to the screen's content, at 2x, with names that don't change. The data is invented and
uses the site's names. The run page lists only the steps a run reached, so the step after the
approval isn't in the picture.

Don't run Playwright on the shared runner (HAL-2418). Push and let CI run it. See
[the shell's README](../../packages/studio/shell/README.md) for the shell's own end-to-end tests.
