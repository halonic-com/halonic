import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

// The tests run scrypt at the current settings in a worker thread
// (`src/test/scrypt-in-worker.spec.ts`), where one hash takes about 0.2 s on a
// free core. The slowest test makes three. The limit leaves room for a CI
// runner that runs every package's tests at once.
export default definePackageTestConfig({ test: { testTimeout: 60_000, hookTimeout: 60_000 } });
