# @halonicjs/studio-feature-runs

The Studio Runs: the runs list, the run page with its receipt and what each run ran, Home's Recent runs and Ctrl K's run rows. It reads the open workspace's runs from `RunsSourceService`, which the app provides, and says about each run what `halonic runs` says: where a run stands and what it waits for come from `runStanding` and `runWait` in `@halonicjs/app`, and money from `moneyAmount`.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-runs` (the feature) and `@halonicjs/studio-feature-runs/api`

## Example

```ts
import { RunsSourceService, runRow } from "@halonicjs/studio-feature-runs/api";

const source = context.services.get(RunsSourceService);
const rows = (await source.list()).map((run) =>
  runRow(run, {
    workflow: source.workflow(run.summary.hubId, run.summary.workflowId),
    currency: source.currency(),
    now: new Date(),
  }),
);
rows[0]; // { shortId: "01jd8q", chip: { word: "Needs you", tone: "warning", dot: true }, line: "Waiting for 2 approvals", … }
```

A row's line is never empty and says what the What column of `halonic runs` says (requirement `runs.row`). A finished run shows its cost with the calls that had no price, and never "€0.00".

## The Runs list

The feature keeps one `RunsList` per open workspace, from `RunsSourceService`. The Runs place's page and the sidebar's running dot ("Runs, 1 running") read it, so they change together (requirement `runs.list`). A refresh swaps the rows in place and never shows a skeleton again; when a later load fails the rows stay, under "The engine isn't answering. Showing what it said last.".

What the list shows is worked out in `list/runs-filter.ts`, so the page only draws it:

```ts
import { dayGroups, emptyList, filterRuns, startFilters } from "./list/runs-filter.ts";

const filters = { ...startFilters, status: "failed" }; // Failed takes every Stopped run too
filterRuns(rows, filters); // a finished test run stays hidden until Test runs is on
emptyList(rows, filters); // { kind: "status", line: "No failed runs." }, or undefined with rows
dayGroups(filterRuns(rows, filters), new Date()); // [{ day: "Today", rows }, { day: "Yesterday", rows }]
```

The page draws them as one kit List with `groups` and `columns`: an `h3` for each day, which ↑ ↓ pass over, and in each row the status chip, the short id, what ran with its line and Test tag, what started the run, and the start time over how long the run took. Below 800px of list width the kit stacks the columns. Screen readers hear the row's `label` instead: "Run 01jd8q, Support reply, needs you, waiting for 2 approvals. Started by you, in the terminal, 10:40.".

The Started by column reads the run's trigger: "You, with Run", "A message arrived", "A signal arrived", "Schedule · weekdays at 08:00" with the routine's name in a tooltip (from the source's `routine`), "Caught up after sleep" for a catch-up run, and `Test “<case>”` for a test run. A run without a trigger was started in the terminal, "You, in the terminal", and a child run names its parent, "Run 7k2m9p". Until the run log records which test case started a test run, the source has no `testCase` and the column says "A test case". The row's sentence has its own words after "Started by", which read on from it: "a message", "the schedule, weekdays at 08:00", "a catch-up after sleep" (`rowLabelWords.startedBy`).

Not on the list yet: the spend line (it needs T4's spend function), opening a run in a new tab, the text and hub filters, and the row's ⋮.

The run page says under its title what the run ran, from the version its run.started records:

```tsx
import { RunVersionLine } from "./run-view/run-version-line.tsx";

<RunVersionLine version={started.version} now={new Date()} />;
// "Ran the live version from 10:42." (commit in the tooltip), "Ran the saved files."
// or, for a run from before the log recorded it, "Version not recorded."
```

The line says when the version was made, never when a file changed, and never suggests that saved changes don't run (requirement `runs.run-view.live-or-saved`).

## Blocked sites

Each site a step's sandbox refused is named once, with its tries (requirement `runs.run-view.blocked-sites`), from `blockedSites` in `@halonicjs/events`:

```tsx
import { blockedSites } from "@halonicjs/events";
import { BlockedSitesLine, BlockedSitesPanel, entrySiteLimit } from "./run-view/blocked-sites.tsx";

const [install] = blockedSites(events, { limit: entrySiteLimit });
// Under the step's meta line: "Blocked 2 sites", which opens the step's entry.
<BlockedSitesLine step={install} expanded={open} onOpen={openEntry} />;
// In the open entry: the sites, the hint and "Open Writer's allowed sites".
<BlockedSitesPanel step={install} agent="Writer" noConnectionProven place="desktop" onOpenAllowedSites={openHarness} />;
```

`BlockedSitesLogLines` writes the run log view's "Blocked: registry.npmjs.org (12 tries)" lines (`logSiteLimit`, 20 per step), and `BlockedSitesBannerText` the failed banner's several-sites sentence. Every sentence comes from `blocked-sites-words.ts` by key; the words are placeholders until the board approves the sandbox screens (HAL-1784).

- Site names are plain text, never links, with the registrable domain in bold (`SiteNameText`, from `siteName` in `@halonicjs/std`).
- Studio never adds a site: the action opens the agent's allowed sites, and the person adds it.
- Pass `noConnectionProven={false}` for a run on Windows until the blocked-site suite runs green there (HAL-6219): on Windows a blocked name may still be looked up outside the sandbox, so the hint leaves out "No connection was made."
- Only traffic through the sandbox's proxy has a site name. A block without one gets no row in 0.1.

## The run page

A run is its own item kind, `run`, one run per tab. A row of the Runs list, or a child run's **Open run**, opens it in the active tab through the shell's `openItem`. The page reads the same `RunsList`, so it moves on with the run (requirement `runs.run-page`). What it shows is worked out in `run-view/run-page-model.ts`:

```ts
import { runBanner, runHeader } from "./run-view/run-page-model.ts";

runHeader(run, context); // { title: "Run 01jd8q", kindLabel: "Run · Support reply", line: "today 10:40 · updates live", … }
runBanner(run, context); // { kind: "callout", tone: "warning", name: "Waiting for you", action: { kind: "review-in-inbox" }, … }
```

Not there yet: the receipt, Every step and Details; Started by; the header's ⋮; Run again (T7); the failed banners by cause (HAL-1845).
