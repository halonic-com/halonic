import type { ConnectorFactoryContext } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  config,
  lister,
  profileNumber,
  setUp,
  TestFactory,
  TestSandbox,
  trustedAsLoaded,
} from "./local-tool-fixtures.spec.ts";
import { LocalToolUnavailableError, PluginLocalTools } from "./plugin-local-tools.ts";

verifies("app.plugin-local-tool-release", () => {
  it("releases a session once it and its connector have closed", async () => {
    const { local, factory, sandbox, released } = setUp();
    const connector = local.connector(lister);
    await connector.callTool("list-files", {});
    expect(released).toEqual([]);
    await connector.close();
    await connector.close();
    expect(released).toEqual([1]);
    expect(factory.closed).toBe(1);
    expect(sandbox?.sessions[0]?.fence).toEqual({ state: "stopped" });
  });

  it("releases an ended session before the next one opens, and the next one on close", async () => {
    const { local, released } = setUp();
    const connector = local.connector(lister);
    await expect(connector.callTool("outlast", {})).rejects.toThrow("has ended");
    expect(released).toEqual([1]);
    await connector.callTool("list-files", {});
    await connector.close();
    expect(released).toEqual([1, 2]);
  });

  it("releases a session that opens without a fence", async () => {
    const sandbox = new TestSandbox();
    sandbox.fence = { state: "off" };
    const { local, released } = setUp(sandbox);
    await expect(local.connector(lister).listTools()).rejects.toThrow(LocalToolUnavailableError);
    expect(released).toEqual([1]);
  });

  it("releases a session the sandbox can't open", async () => {
    const sandbox = new TestSandbox();
    sandbox.open = async () => {
      throw new Error("the session didn't open");
    };
    const { local, released } = setUp(sandbox);
    await expect(local.connector(lister).listTools()).rejects.toThrow("didn't open");
    expect(released).toEqual([1]);
  });

  it("releases a session prepared under another connector id, before any session opens", async () => {
    const sandbox = new TestSandbox();
    let released = 0;
    const local = new PluginLocalTools({
      sandbox,
      factory: new TestFactory(),
      context: {} as Omit<ConnectorFactoryContext, "trust" | "sandbox">,
      startTrust: trustedAsLoaded(),
      prepare: async () => ({
        config: { ...config, id: "other" },
        profile: profileNumber(1),
        release: async () => {
          released += 1;
        },
      }),
    });
    await expect(local.connector(lister).listTools()).rejects.toThrow("was prepared as connector");
    expect(released).toBe(1);
    expect(sandbox.sessions).toEqual([]);
  });

  it("doesn't let a release that fails hide why the call failed", async () => {
    const sandbox = new TestSandbox();
    sandbox.fence = { state: "not-fenced", reason: "a probe got through" };
    const { local, released } = setUp(sandbox, { releaseFails: true });
    await expect(local.connector(lister).listTools()).rejects.toMatchObject({
      state: { kind: "sandbox-not-fenced", fence: "not-fenced" },
    });
    expect(released).toEqual([1]);
  });
});
