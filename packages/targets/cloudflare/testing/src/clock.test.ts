import { runSuitesInWorkerd } from "./index.ts";

// The Clock contract, run inside workerd: the first port through the harness.
await runSuitesInWorkerd([new URL("./worker/suites/clock.ts", import.meta.url)]);
