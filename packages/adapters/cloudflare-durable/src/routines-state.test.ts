import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The routines state over a real Durable Object's alarm, inside workerd: one workerd per
// requirement, so each case is tagged with the requirement it proves.
const bindings = { durableObjects: { STATE_HOST: "StateHostObject" } };

await runSuitesInWorkerd([new URL("./test/routines-tick.spec.ts", import.meta.url)], {
  ...bindings,
  wrap: (register) => verifies("cloudflare-durable.routines-tick", register),
});

await runSuitesInWorkerd([new URL("./test/routines-tick-limits.spec.ts", import.meta.url)], {
  ...bindings,
  wrap: (register) => verifies("cloudflare-durable.routines-tick-limits", register),
});
