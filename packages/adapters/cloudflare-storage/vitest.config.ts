import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";
import { configDefaults } from "vitest/config";

export default definePackageTestConfig({
  test: {
    // The *.workerd.test.ts files are suites for workerd's own runner, not for Node: they
    // import `cloudflare:workers`. The Node tests that start workerd load them from there.
    exclude: [...configDefaults.exclude, "src/**/*.workerd.test.ts"],
  },
});
