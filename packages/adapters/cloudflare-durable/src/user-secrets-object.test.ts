import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// A person's sealed secrets over a real Durable Object's storage, inside workerd.
await runSuitesInWorkerd([new URL("./test/user-secrets.spec.ts", import.meta.url)], {
  durableObjects: { USAGE: "UsageObject" },
  wrap: (register) => verifies("cloudflare-durable.user-secrets", register),
});
