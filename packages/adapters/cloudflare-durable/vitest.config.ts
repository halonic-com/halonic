import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

export default definePackageTestConfig({
  resolve: {
    // The Durable Object classes import `cloudflare:workers`, which only workerd has. Node
    // runs them over this stub; the workerd tests run the real ones.
    alias: {
      "cloudflare:workers": new URL("./src/node/cloudflare-workers.stub.ts", import.meta.url)
        .pathname,
    },
  },
});
