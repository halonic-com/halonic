import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";

// The Coordination contract inside workerd, against a Durable Object whose clock the suite moves.
await runSuitesInWorkerd([new URL("./test/coordination.spec.ts", import.meta.url)], {
  durableObjects: { COORDINATION: "TestCoordinationObject" },
});
