import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

// Each scrypt check at the current settings takes seconds in JavaScript on a
// loaded runner, and the contract suite does about a dozen of them.
export default definePackageTestConfig({ test: { testTimeout: 60_000, hookTimeout: 60_000 } });
