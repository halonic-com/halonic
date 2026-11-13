import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The binding name is the one wrangler.toml gives; the class is the one the Worker exports.
await runSuitesInWorkerd([new URL("./test/worker.spec.ts", import.meta.url)], {
  durableObjects: { COORDINATION: "CoordinationObject" },
  wrap: (register) => verifies("runtime.durable-object-migrations", register),
});
