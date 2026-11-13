import type { ConnectorConfig, ConnectorFactoryContext } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { AgentHostConnectorFactory } from "./connector.ts";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostError } from "./transport.ts";

const config: ConnectorConfig = {
  id: "notes",
  secretEnv: { NOTES_KEY: "notes-key" },
  transport: {
    kind: "stdio",
    command: "node",
    args: ["tools/notes.js"],
    env: { MODE: "read" },
    sites: ["notes.example.com"],
  },
};

const trust = { location: "/work/space", fingerprint: "hfp1:made-up" };

function contextWith(change: Partial<ConnectorFactoryContext> = {}): ConnectorFactoryContext {
  return {
    secrets: {
      get: async (name) => (name === "notes-key" ? "made-up-value" : null),
    },
    tokens: {} as never,
    http: {} as never,
    workspaceRoot: "/work/space",
    workingFolders: ["/work/space/agents/coder"],
    trust,
    ...change,
  };
}

function hostWithConnector(): FakeHost {
  return new FakeHost()
    .answer("POST /v1/connectors/open", ok({ connector: "c1" }))
    .answer(
      "POST /v1/connectors/tools",
      ok([{ name: "echo", description: "Echoes.", parameters: {} }]),
    )
    .answer("POST /v1/connectors/call", ok({ text: "hello" }))
    .answer("POST /v1/connectors/close", ok({ closed: true }));
}

function connector(host: FakeHost, context = contextWith()) {
  return new AgentHostConnectorFactory(host).create(config, context);
}

function routesCalled(host: FakeHost): string[] {
  return host.calls.map((call) => call.route);
}

verifies("agent-host-client.connector", () => {
  describe("the stand-in stdio connector", () => {
    it("calls the host only once a call needs it", () => {
      const host = hostWithConnector();
      connector(host);
      expect(host.calls).toEqual([]);
    });

    it("opens with the file, the folders, the trust grant and only its own secrets, and no profile", async () => {
      const host = hostWithConnector();
      await connector(host).listTools();
      expect(host.calls[0]).toEqual({
        route: "POST /v1/connectors/open",
        body: {
          id: "notes",
          command: "node",
          args: ["tools/notes.js"],
          env: { MODE: "read" },
          sites: ["notes.example.com"],
          secretEnv: { NOTES_KEY: "notes-key" },
          secrets: { "notes-key": "made-up-value" },
          workspaceRoot: "/work/space",
          workingFolders: ["/work/space/agents/coder"],
          trust,
        },
      });
    });

    it("lists tools and calls one by the host's id, passing the idempotency key on", async () => {
      const host = hostWithConnector();
      const client = connector(host);
      expect(await client.listTools()).toEqual([
        { name: "echo", description: "Echoes.", parameters: {} },
      ]);
      expect(await client.callTool("echo", { a: 1 }, { idempotencyKey: "run:1" })).toBe("hello");
      expect(host.calls.slice(1)).toEqual([
        { route: "POST /v1/connectors/tools", body: { connector: "c1" } },
        {
          route: "POST /v1/connectors/call",
          body: { connector: "c1", tool: "echo", args: { a: 1 }, idempotencyKey: "run:1" },
        },
      ]);
    });

    it("opens once for calls made at the same time", async () => {
      const host = hostWithConnector();
      const client = connector(host);
      await Promise.all([client.listTools(), client.callTool("echo", {})]);
      expect(routesCalled(host).filter((route) => route.endsWith("/open"))).toHaveLength(1);
    });

    it("refuses without a trust grant or a workspace folder, and without calling the host", async () => {
      const { workspaceRoot: _root, ...noWorkspace } = contextWith();
      for (const context of [contextWith({ trust: null }), noWorkspace]) {
        const host = hostWithConnector();
        await expect(connector(host, context).listTools()).rejects.toThrow(/notes/);
        expect(host.calls).toEqual([]);
      }
    });

    it("names a secret that isn't set, without calling the host", async () => {
      const host = hostWithConnector();
      const client = connector(host, contextWith({ secrets: { get: async () => null } }));
      await expect(client.listTools()).rejects.toThrow('needs the secret "notes-key"');
      expect(host.calls).toEqual([]);
    });

    it("throws the host's status, kind and message, and tries to open again after a refusal", async () => {
      const host = hostWithConnector().answer(
        "POST /v1/connectors/open",
        refused(403, "workspace_not_named", "Not one of the folders."),
      );
      const client = connector(host);
      const error = await client.listTools().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AgentHostError);
      expect(error).toMatchObject({ status: 403, kind: "workspace_not_named" });
      host.answer("POST /v1/connectors/open", ok({ connector: "c2" }));
      await client.listTools();
      expect(host.calls.at(-1)?.body).toEqual({ connector: "c2" });
    });

    it("closes once in the host, and does nothing when it never opened", async () => {
      const host = hostWithConnector();
      await connector(host).close();
      expect(host.calls).toEqual([]);
      const client = connector(host);
      await client.listTools();
      await client.close();
      await client.close();
      expect(routesCalled(host).filter((route) => route.endsWith("/close"))).toHaveLength(1);
    });

    it("counts a connector the host no longer has as closed", async () => {
      const host = hostWithConnector().answer(
        "POST /v1/connectors/close",
        refused(404, "unknown_connector", "Gone."),
      );
      const client = connector(host);
      await client.listTools();
      await expect(client.close()).resolves.toBeUndefined();
    });

    it("throws for a call after close", async () => {
      const host = hostWithConnector();
      const client = connector(host);
      await client.close();
      await expect(client.callTool("echo", {})).rejects.toThrow("is closed");
    });
  });
});
