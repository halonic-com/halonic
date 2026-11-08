import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

// Many of these tests start real git and Node.js processes. When
// `pnpm verify --full` runs every package at once, one such test can take
// over the 5 s default, so give the whole package room instead of flaking.
export default definePackageTestConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });
