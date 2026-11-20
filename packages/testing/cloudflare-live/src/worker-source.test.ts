import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { createVitest } from "vitest/node";
import type { workerSource } from "./worker-source.ts";

/**
 * Loads `workerSource` the way the live suite's global setup is loaded: through Vitest's module
 * runner, where `import.meta.resolve` throws (HAL-13741). A test file runs in a pool worker, which
 * supports it, so calling the function directly here wouldn't catch that.
 */
async function workerSourceInModuleRunner(): Promise<ReturnType<typeof workerSource>> {
  const vitest = await createVitest({
    root: fileURLToPath(new URL("..", import.meta.url)),
    config: false,
    watch: false,
    reporters: [],
  });
  try {
    const module = await vitest.import<{ workerSource: typeof workerSource }>(
      fileURLToPath(new URL("./worker-source.ts", import.meta.url)),
    );
    return module.workerSource();
  } finally {
    await vitest.close();
  }
}

verifies("cloudflare-live.fixture", () => {
  it("finds the runtime's entry and compatibility date in the global setup's module runner", async () => {
    const source = await workerSourceInModuleRunner();

    expect(source.entry).toMatch(/cloudflare[\\/]runtime[\\/]src[\\/]index\.ts$/);
    expect(existsSync(source.entry)).toBe(true);
    expect(source.compatibilityDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
