import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

// Test files share a worker's modules and environment: about twice as fast,
// because most of the time went to setting both up per file (HAL-15904).
export default definePackageTestConfig({
  test: { isolate: false, setupFiles: ["src/test-support/mock-files-api.spec.ts"] },
});
