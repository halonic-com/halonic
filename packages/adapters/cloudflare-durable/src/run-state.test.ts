import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The run state over a real Durable Object's storage and alarm, inside workerd: one workerd per
// requirement, so each case is tagged with the requirement it proves.
const bindings = { durableObjects: { STATE_HOST: "StateHostObject" } };

await runSuitesInWorkerd([new URL("./test/run-state-timers.spec.ts", import.meta.url)], {
  ...bindings,
  wrap: (register) => verifies("cloudflare-durable.timers", register),
});

await runSuitesInWorkerd([new URL("./test/run-state-outbox.spec.ts", import.meta.url)], {
  ...bindings,
  wrap: (register) => verifies("cloudflare-durable.run-list-outbox", register),
});

await runSuitesInWorkerd([new URL("./test/run-state-health.spec.ts", import.meta.url)], {
  ...bindings,
  wrap: (register) => verifies("cloudflare-durable.watchdog", register),
});
