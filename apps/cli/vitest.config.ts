import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

export default definePackageTestConfig({
  // Every command test fails when a command's lines printed ahead don't start its result.
  test: { setupFiles: ["./src/test/print-ahead-check.spec.ts"] },
});
