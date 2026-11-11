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

The run page says under its title what the run ran, from the version its run.started records:

```tsx
import { RunVersionLine } from "./run-view/run-version-line.tsx";

<RunVersionLine version={started.version} now={new Date()} />;
// "Ran the live version from 10:42." (commit in the tooltip), "Ran the saved files."
// or, for a run from before the log recorded it, "Version not recorded."
```

The line says when the version was made, never when a file changed, and never suggests that saved changes don't run (requirement `runs.run-view.live-or-saved`).
