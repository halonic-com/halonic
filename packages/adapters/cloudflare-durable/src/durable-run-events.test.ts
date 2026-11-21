import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// Following a run's events inside workerd, over a stream the test writes by hand.
await runSuitesInWorkerd([new URL("./test/durable-run-events.spec.ts", import.meta.url)], {
  wrap: (register) => verifies("cloudflare-durable.run-events-subscription", register),
});
