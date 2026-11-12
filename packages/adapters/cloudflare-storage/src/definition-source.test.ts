import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";

// The DefinitionSource contract, run inside workerd over a real R2 binding.
await runSuitesInWorkerd([new URL("./r2-definition-source.workerd.test.ts", import.meta.url)], {
  r2Buckets: ["DEFINITIONS"],
});
