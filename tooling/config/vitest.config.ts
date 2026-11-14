import { definePackageTestConfig } from "./src/vitest-preset.ts";

export default definePackageTestConfig({
  test: {
    coverage: {
      // The workerd coverage provider is tested by a nested Vitest run (workerd-coverage-provider.test.ts).
      // Vitest loads it through its own module runner, so this run's coverage can't see it.
      exclude: ["src/workerd-coverage-provider.ts"],
    },
  },
});
