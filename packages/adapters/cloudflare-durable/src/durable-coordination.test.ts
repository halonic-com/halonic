import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The adapter against the real coordination objects, inside workerd. `coordination.test.ts` runs
// the Coordination contract through it.
const bindings = { durableObjects: { COORDINATION: "TestCoordinationObject" } };

await runSuitesInWorkerd(
  [new URL("./test/durable-coordination.spec.ts", import.meta.url)],
  bindings,
);

await runSuitesInWorkerd([new URL("./test/coordination-names.spec.ts", import.meta.url)], {
  ...bindings,
  wrap: (register) => verifies("cloudflare-durable.coordination", register),
});
