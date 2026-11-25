import { verifies } from "@halonicjs/testing-spec";
import * as protocol from "@paperclipai/plugin-sdk/protocol";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { afterEach, describe, expect, test, vi } from "vitest";
import { type PluginSdk, sdkHost } from "./sdk-host.test-helper.ts";
import { probeSetup } from "./worker-probe.test-helper.ts";
import { maxFrameLength, pinnedSdkVersion } from "./worker-protocol.ts";

/** The plugin SDK, as the test host uses it. */
const sdk: PluginSdk = { ...protocol, createTestHarness };

// What the worker refuses, and that it keeps running after each refusal.

/** The error answers the worker wrote to requests it couldn't read. */
function errorsWritten(written: readonly unknown[]) {
  return written
    .map((message) => message as { id?: unknown; error?: { code: number; message: string } })
    .filter((message) => message.error !== undefined);
}

/** The calls back to Paperclip the worker wrote, by method. */
function callsBack(written: readonly unknown[]) {
  return written.map((message) => (message as { method?: string }).method).filter(Boolean);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

verifies("runtime.worker-protocol", () => {
  describe("framing", () => {
    test.each([
      ["a line that isn't JSON", "{not json", -32700],
      ["a JSON value that isn't an object", "[1, 2]", -32600],
      [
        "a message of another JSON-RPC version",
        '{"jsonrpc":"1.0","id":1,"method":"health"}',
        -32600,
      ],
      ["a request whose id is an object", '{"jsonrpc":"2.0","id":{},"method":"health"}', -32600],
      ["a line longer than the limit", `"${"x".repeat(maxFrameLength + 1)}"`, -32600],
    ])("%s gets a JSON-RPC error and the worker keeps answering", async (_name, line, code) => {
      const host = sdkHost(sdk, { capabilities: [], setup: probeSetup });

      host.send(`${line}\n`);

      expect(await host.request("health", {})).toMatchObject({ result: { status: "ok" } });
      expect(errorsWritten(host.written)).toEqual([
        { jsonrpc: "2.0", id: null, error: expect.objectContaining({ code }) },
      ]);
    });

    test("a too-long line that arrives in pieces is refused once, and the next line is read", async () => {
      const host = sdkHost(sdk, { capabilities: [], setup: probeSetup });

      host.send("x".repeat(maxFrameLength));
      host.send("x".repeat(10));
      host.send("more of the same line\n");

      expect(await host.request("health", {})).toMatchObject({ result: { status: "ok" } });
      expect(errorsWritten(host.written)).toHaveLength(1);
    });

    test("a method the worker doesn't have gets method-not-found", async () => {
      const host = sdkHost(sdk, { capabilities: [], setup: probeSetup });

      expect(await host.request("environmentExecute", {})).toMatchObject({
        error: { code: -32601 },
      });
    });

    test("a tool call before initialize, or with no run context, is refused", async () => {
      const host = sdkHost(sdk, { capabilities: [], setup: probeSetup });

      expect(await host.executeTool({ kind: "echo" })).toMatchObject({ error: { code: -32600 } });
      await host.initialize();
      expect(await host.request("executeTool", { toolName: "probe" })).toMatchObject({
        error: { code: -32602 },
      });
      expect(await host.initialize()).toMatchObject({ error: { code: -32600 } });
    });
  });

  describe("versions", () => {
    test("another plugin API version is refused with both versions named, and no tool is set up", async () => {
      const host = sdkHost(sdk, { capabilities: [], setup: probeSetup });

      const answer = await host.initialize(2);

      expect(answer.error?.message).toContain("plugin API version 2");
      expect(answer.error?.message).toContain(`version 1 (plugin SDK ${pinnedSdkVersion})`);
      expect(await host.executeTool({ kind: "echo" })).toMatchObject({ error: { code: -32600 } });
    });
  });

  describe("capabilities", () => {
    test.each([
      ["state", "plugin.state.write"],
      ["secret", "secrets.read-ref"],
      ["http", "http.outbound"],
      ["agent", "agents.read"],
      ["metric", "metrics.write"],
    ])(
      "a %s call the manifest doesn't declare is refused by the worker itself",
      async (kind, capability) => {
        const host = sdkHost(sdk, { capabilities: ["agent.tools.register"], setup: probeSetup });
        await host.initialize();

        const answer = await host.executeTool({ kind });

        expect(answer).toMatchObject({ result: { error: expect.stringContaining(capability) } });
        expect(callsBack(host.written)).toEqual([]);
      },
    );
  });

  describe("secrets and timeouts", () => {
    test("a call Paperclip never answers fails after the timeout, naming the call", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const capabilities = ["plugin.state.read", "plugin.state.write"];
      const host = sdkHost(sdk, {
        capabilities,
        setup: probeSetup,
        silent: ["state.set"],
        timeoutMs: 5_000,
      });
      await host.initialize();

      const answer = host.executeTool({ kind: "state", value: 1 });
      await vi.advanceTimersByTimeAsync(5_000);

      expect(await answer).toMatchObject({
        result: { error: expect.stringContaining("Paperclip didn't answer state.set within 5 s") },
      });
    });

    test("a token in a request that times out or fails never shows in an answer", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const host = sdkHost(sdk, {
        capabilities: ["http.outbound"],
        setup: probeSetup,
        silent: ["http.fetch"],
        timeoutMs: 5_000,
      });
      await host.initialize();

      const timedOut = host.executeTool({ kind: "http", token: "acme-token-value" });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(JSON.stringify(await timedOut)).not.toContain("acme-token-value");

      const refused = sdkHost(sdk, { capabilities: [], setup: probeSetup });
      await refused.initialize();
      expect(
        JSON.stringify(await refused.executeTool({ kind: "http", token: "acme-token-value" })),
      ).not.toContain("acme-token-value");
    });
  });
});
