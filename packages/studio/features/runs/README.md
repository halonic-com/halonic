# @halonicjs/studio-feature-runs

The Studio Runs feature: the run list, the run page and what each run ran. It starts with the run page's version line; the list and the page itself come with T8 (HAL-1301).

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-runs` (the feature) and `@halonicjs/studio-feature-runs/api`

## Example

```tsx
import { RunVersionLine } from "./run-view/run-version-line.tsx";

// Under the run's title, from the version its run.started records:
<RunVersionLine version={started.version} now={new Date()} />;
// "Ran the live version from 10:42." (commit in the tooltip), "Ran the saved files."
// or, for a run from before the log recorded it, "Version not recorded."
```

The line says when the version was made, never when a file changed, and never suggests that saved changes don't run (requirement `runs.run-view.live-or-saved`).
