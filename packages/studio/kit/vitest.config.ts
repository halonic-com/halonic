import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

// The states page (states/) isn't shipped, but its test proves a forced state matches the real one.
export default definePackageTestConfig({ test: { include: ["states/**/*.test.tsx"] } });
