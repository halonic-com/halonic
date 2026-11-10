import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

// Almost every test here starts several real git processes. On cold,
// uncached CI runners git runs about 7 times slower than on a laptop, so
// cases that take 1 s locally pass the 5 s default (HAL-3828). Give the whole
// package room instead of chasing the flake from one case to the next.
export default definePackageTestConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });
