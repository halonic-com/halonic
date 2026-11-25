import { verifies } from "@halonicjs/testing-spec";
import * as protocol from "@paperclipai/plugin-sdk/protocol";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, test } from "vitest";
import type { PaperclipEvent } from "./host.ts";
import { type PluginSdk, sdkHost } from "./sdk-host.test-helper.ts";
import type { WorkerSetup } from "./worker-client.ts";

/** The plugin SDK, as the test host uses it. */
const sdk: PluginSdk = { ...protocol, createTestHarness };

// Paperclip's events through the worker: the subscription, delivery to the
// listeners, and that neither a refused subscription nor a failing listener
// stops the worker.

const failedRun = {
  eventId: "event-1",
  eventType: "agent.run.failed",
  occurredAt: "2026-11-25T05:00:00.000Z",
  entityId: "run-7",
  companyId: "acme",
  payload: { error: "out of memory" },
};

/** A plugin that keeps the run id of each failed run it hears about, or fails when told to. */
function listening(heard: PaperclipEvent[], fails = false): WorkerSetup {
  return (host) => {
    host.events.on("agent.run.failed", async (event) => {
      if (fails) throw new Error("the listener broke");
      heard.push(event);
    });
  };
}

/** The log lines the worker sent Paperclip. */
function logged(written: readonly unknown[]) {
  return written
    .map((message) => message as { method?: string; params?: unknown })
    .filter((message) => message.method === "log")
    .map((message) => message.params);
}

verifies("runtime.worker-protocol", () => {
  describe("events", () => {
    test("the worker subscribes to its listeners' event and hands Paperclip's event to them", async () => {
      const heard: PaperclipEvent[] = [];
      const host = sdkHost(sdk, {
        capabilities: ["agent.tools.register", "events.subscribe"],
        setup: listening(heard),
      });
      await host.initialize();

      const answer = await host.request("onEvent", { event: failedRun });

      expect(host.written).toContainEqual(
        expect.objectContaining({
          method: "events.subscribe",
          params: { eventPattern: "agent.run.failed", filter: null },
        }),
      );
      expect(answer).toMatchObject({ result: null });
      expect(heard).toEqual([failedRun]);
    });

    test("without events.subscribe the worker doesn't subscribe and says so in Paperclip's log", async () => {
      const host = sdkHost(sdk, { capabilities: ["agent.tools.register"], setup: listening([]) });
      await host.initialize();
      await host.request("health", {});

      const methods = host.written.map((message) => (message as { method?: string }).method);
      expect(methods).not.toContain("events.subscribe");
      expect(logged(host.written)).toEqual([
        { level: "warn", message: expect.stringContaining("events.subscribe") },
      ]);
    });

    test("a failing listener goes to Paperclip's log and the worker keeps running", async () => {
      const host = sdkHost(sdk, {
        capabilities: ["agent.tools.register", "events.subscribe"],
        setup: listening([], true),
      });
      await host.initialize();

      expect(await host.request("onEvent", { event: failedRun })).toMatchObject({ result: null });
      expect(logged(host.written)).toEqual([
        { level: "error", message: "the agent.run.failed listener failed: the listener broke" },
      ]);
      expect(await host.request("health", {})).toMatchObject({ result: { status: "ok" } });
    });

    test("an event without a type or a company is refused with invalid params", async () => {
      const host = sdkHost(sdk, { capabilities: ["agent.tools.register"], setup: listening([]) });
      await host.initialize();

      const answer = await host.request("onEvent", { event: { payload: {} } });

      expect(answer).toMatchObject({ error: { code: -32602 } });
    });
  });
});
