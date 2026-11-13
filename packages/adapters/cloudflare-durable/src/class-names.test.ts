import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// Inside workerd, the Worker exports the class under the name it is deployed with, as the real Worker will.
await runSuitesInWorkerd([new URL("./test/class-names.spec.ts", import.meta.url)], {
  durableObjects: { DEPLOYED: "CoordinationObject", RUN_DEPLOYED: "RunObject" },
  wrap: (register) => verifies("cloudflare-durable.class-names", register),
});
