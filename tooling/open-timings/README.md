# @halonicjs/tooling-open-timings

Reads the `timings` lines Studio's shell writes to `shell.log` (HAL-19531) and turns them into a
table of step and milliseconds for a CI job summary. It flags an open that takes longer than a
generous 10 s, to catch big regressions; shared runners vary too much for a tighter gate.

- **Layer:** tooling
- **Owner:** elena
- **Public API:** `@halonicjs/tooling-open-timings`

## Example

```ts
import { formatSummary, parseTimings } from "@halonicjs/tooling-open-timings";

const timings = parseTimings(shellLogText);
console.log(formatSummary(timings)); // | start | 4000 | … | engine | 3250 | …
```

In CI, `measure-open.ps1` starts the installed Studio twice on Windows: the first start puts
`examples/acme` in Recent through WebView2's DevTools port, the second reopens it as a person's
next start would, and the job summary gets the table (`pnpm --filter
@halonicjs/tooling-open-timings timings summary <shell.log>`).
