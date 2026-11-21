import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";

// The time limit inside workerd.
await runSuitesInWorkerd([new URL("./test/time-limit.spec.ts", import.meta.url)]);
