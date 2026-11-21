import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { LocalExecutorOptions } from "@halonicjs/engine";
import { noKeyOrigins } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { EngineService } from "./engine-service.ts";

// The runs options the service builds, caught on their way into the shared assembly.
const built = vi.hoisted(() => ({ runs: [] as unknown[] }));
vi.mock("@halonicjs/engine", async (importOriginal) => {
  const engine = await importOriginal<typeof import("@halonicjs/engine")>();
  return {
    ...engine,
    assembleEngine: (options: Parameters<typeof engine.assembleEngine>[0]) => {
      built.runs.push(options.executor.runs);
      return engine.assembleEngine(options);
    },
  };
});

/** A service on a workspace whose workspace.yaml is `settings`, with a shell that answers every command. */
function serviceOf(settings: string): EngineService {
  return new EngineService({
    ipc: {
      invoke: async (command) =>
        command === "record_read" ? { lines: "", version: "0", file: "records" } : undefined,
    },
    lock: { hold: async () => ({ release: async () => {} }) },
    location: "/acme",
    name: "Acme",
    timeZone: "UTC",
    definitions: new MemoryDefinitionStore({ "workspace.yaml": settings }),
    secrets: { get: async () => null },
    keyOrigins: noKeyOrigins,
    http: { fetch },
    clock: { now: () => new Date("2026-11-15T10:00:00.000Z") },
    ids: { next: (prefix) => `${prefix}1` },
    setTimer: () => () => {},
    newToken: () => "token",
    reportError: () => {},
    isTrusted: async () => true,
    mayStart: async () => true,
  });
}

verifies("studio.engine-service", () => {
  describe("the engine's runs", () => {
    it("keep to the budget in workspace.yaml", async () => {
      const service = serviceOf("id: acme\nname: Acme\nbudget: { currency: USD, monthly: 20 }\n");

      await service.open();
      const runs = built.runs.at(-1) as LocalExecutorOptions["runs"];

      expect(await runs?.budget?.()).toEqual({ currency: "USD", monthly: 20 });
      await service.close();
    });

    it("keep to none when workspace.yaml sets no limit", async () => {
      const service = serviceOf("id: acme\nname: Acme\nbudget: { currency: USD }\n");

      await service.open();
      const runs = built.runs.at(-1) as LocalExecutorOptions["runs"];

      expect(await runs?.budget?.()).toBeUndefined();
      await service.close();
    });
  });
});
