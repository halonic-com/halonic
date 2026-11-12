import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

// A scrypt check at the current settings takes 2 to 7 seconds on a free core,
// but the CI job runs every package's tests at once, and on that runner the
// same check has taken over a minute. The limit leaves room for that.
export default definePackageTestConfig({ test: { testTimeout: 180_000, hookTimeout: 180_000 } });
