# @halonicjs/studio-feature-runs

The Studio Runs: the runs list, the run page and what each run ran, and later the receipt, Home's Recent runs and Ctrl K's run rows. It reads the open workspace's runs from `RunsSourceService`, which the app provides, and says about each run what `halonic runs` says: where a run stands and what it waits for come from `runStanding` and `runWait` in `@halonicjs/app`, and money from `moneyAmount`.

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

The feature keeps one `RunsList` per open workspace, from `RunsSourceService`. The Runs place's page and the sidebar's running dot ("Runs, 1 running") read it, so they change together (requirement `runs.list`). A refresh swaps the rows in place and never shows a skeleton again; when a later load fails the rows stay, under "Couldn't refresh runs." and why. Only a host that says the engine can't be reached (`EngineNotAnswering`) gets "isn't answering", in that host's words (`engineWordsOf`); any other failure gives its own reason, or "Halonic ran into a problem it can't explain yet." with Copy details (`load-failure.tsx`).

What the list shows is worked out in `list/runs-filter.ts`, so the page only draws it:

```ts
import { dayGroups, emptyList, filterRuns, startFilters } from "./list/runs-filter.ts";

const filters = { ...startFilters, status: "failed" }; // Failed takes every Stopped run too
filterRuns(rows, filters); // a finished test run stays hidden until Test runs is on
emptyList(rows, filters); // { kind: "status", line: "No failed runs." }, or undefined with rows
dayGroups(filterRuns(rows, filters), new Date()); // [{ day: "Today", rows }, { day: "Yesterday", rows }]
```

The page draws them as one kit List with `groups` and `columns`: an `h3` for each day, which ↑ ↓ pass over, and in each row the status chip, the short id, what ran with its line and Test tag, what started the run, and the start time over how long the run took. When a row's main cell is under 800px wide, the kit stacks the columns. Screen readers hear the row's `label` instead: "Run 01jd8q, Support reply, needs you, waiting for 2 approvals. Started by you, in the terminal, 10:40.".

The Started by column reads the run's trigger: "You, with Run", "A message arrived", "A signal arrived", "Schedule · weekdays at 08:00" with the routine's name in a tooltip (from the source's `routine`), "Caught up after sleep" for a catch-up run, and `Test “<case>”` for a test run. A run without a trigger was started in the terminal, "You, in the terminal", and a child run names its parent, "Run 7k2m9p". Until the run log records which test case started a test run, the source has no `testCase` and the column says "A test case". The row's sentence has its own words after "Started by", which read on from it: "a message", "the schedule, weekdays at 08:00", "a catch-up after sleep" (`rowLabelWords.startedBy`).

Not on the list yet: the spend line (it needs T4's spend function), opening a run in a new tab, the text and hub filters, and the row's ⋮.

The run page says under its title what the run ran, from the version its run.started records:

```tsx
import { RunVersionLine } from "./run-view/run-version-line.tsx";

<RunVersionLine version={started.version} now={new Date()} />;
// "The live version from 10:42." (commit in the tooltip), "The saved files."
// or, for a run from before the log recorded it, "Version not recorded."
```

The line says when the version was made, never when a file changed, and never suggests that saved changes don't run (requirement `runs.run-view.live-or-saved`).

## What a step could do

The line under a sandboxed step and the list in its open entry (requirement `runs.run-view.sandbox-panel`) are read from the step's `sandbox.opened` or `sandbox.off` event by `stepSandboxes`, never from the agent's current settings:

```tsx
import { stepSandboxes } from "./run-view/sandbox-model.ts";
import { SandboxPanel, sandboxLineText } from "./run-view/sandbox-panel.tsx";

const [step] = stepSandboxes(events, "step-1");
// kind "opened": the line is sandboxLineText(step.view), the list is:
<SandboxPanel view={step.view} agent={step.agent} live={run.summary.endedAt === null} place="desktop" />;
```

A step with neither event (an old run, or a step with no program) has no line; a damaged `sandbox.opened` says it couldn't be read. Every sentence comes from `sandbox-words.ts` by key; the words are placeholders until the board approves the sandbox screens (HAL-1784).

Not built yet: **Your sign-in** (HAL-1710), the workflow run card's line, and the desktop action "Change in *Writer*'s settings" (`onOpenHarness`), which needs sandbox settings on the agent's Harness page to open (HAL-12658). Until then a phone says to change it in the agent's file.

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
- Studio never adds a site: the action opens the agent's allowed sites, and the person adds it. The run page doesn't pass `onOpenAllowedSites` yet: the agent page has no Allowed sites field to open (HAL-12658).
- Pass `noConnectionProven={noConnectionProven(events, entryId)}` (`sandbox-model.ts`): true only when every program of the step ran in an `os` sandbox, which today is srt, whose blocked-site suites prove no connection is made on Linux, macOS and Windows (HAL-6219). On Windows a blocked name may still be looked up outside the sandbox, so the hint says "No connection was made." and never that nothing reached the site.
- Only traffic through the sandbox's proxy has a site name. A block without one gets no row yet.

## The run page

A run is its own item kind, `run`, one run per tab. A row of the Runs list, or a child run's **Open run**, opens it in the active tab through the shell's `openItem`. The page reads the same `RunsList`, so it moves on with the run (requirement `runs.run-page`). A run's tab stays open when the run leaves the workspace (the kind's `tab.exists` is always true): the page says so itself. What it shows is worked out in `run-view/run-page-model.ts`:

```ts
import { runBanner, runHeader } from "./run-view/run-page-model.ts";

runHeader(run, context); // { title: "Run 01jd8q", kindLabel: "Support reply", line: "today 10:40 · updates live", … }
runBanner(run, context); // { kind: "callout", tone: "warning", name: "Waiting for you", action: { kind: "review-in-inbox" }, … }
```

Every step reads the run's whole log from the source (`RunsSource.log`) and lists the steps `runSteps` in `@halonicjs/app` finds, the same steps `halonic runs show` prints (requirement `runs.every-step`). Each entry is worked out in `run-view/every-step-model.ts`:

```ts
import { everyStep } from "./run-view/every-step-model.ts";

everyStep(events, summary, workflow, new Date());
// [{ id: "step-0", name: "Read", mark: "done", line: "Took 1 min", time: "10:40", label: "Read, done, 10:40, Took 1 min" }, …]
```

Above Every step, the receipt's Items section names the files the run saved (requirement `runs.run-view.receipt-items`), and a dashed frame, "What the agent says it did (its own words, not checked)", holds the last answer an agent of the run gave, as plain text (requirement `runs.run-view.agent-says`). The frame is model output: the receipt's lines never come from it.

```ts
import { agentSays, itemLines } from "./run-view/receipt-model.ts";

itemLines(events); // ["Created 1 file: weekly-report.md"]
agentSays(events); // "This week: 12 emails…"
```

Under the timeline, **Show the run log** shows the run's events in its place, numbered by `seq`, the same events `halonic runs show --json` returns, and **Show every step** brings the timeline back (requirement `runs.run-view.run-log`). Each line's fields are one line of JSON with hidden characters escaped (`escapeHidden` in `@halonicjs/std`), and a step's blocked sites read "Blocked: registry.npmjs.org (12 tries)" once:

```ts
import { runLogLines } from "./run-view/run-log-model.ts";

runLogLines(events);
// [{ kind: "event", seq: 1, time: "10:40:00", type: "run.started", fields: '{"hubId":"acme",…}' }, …]
```

Enter or a click on an entry opens its events in a side panel beside the page: the step's model calls with their model and tokens, then its tool calls with their arguments folded. ✕ or Escape closes it, and focus goes back to the entry (requirement `runs.run-view.step-events`):

```ts
import { stepEvents } from "./run-view/step-events-model.ts";

stepEvents(events, "step-1");
// { modelCalls: [{ id: 5, model: "claude-sonnet", tokens: "1,204 in · 312 out" }],
//   toolCalls: [{ id: 6, tool: "send_email", args: '{\n  "to": "sam@acme.example"\n}' }] }
```

Not there yet: the receipt and Details; the step's blocked sites in its panel; Started by; the header's ⋮; Run again (T7); the failed banners by cause (HAL-1845).
