import type { ConnectorConfig, ConnectorFactoryContext } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { AgentHostConnectorFactory } from "./connector.ts";
import { ConnectorFailedError } from "./connector-failure.ts";
import { FakeHost, ok } from "./fake-host.test-helper.ts";
import { AgentHostError } from "./transport.ts";

const config: ConnectorConfig = {
  id: "notes",
  secretEnv: { NOTES_KEY: "notes-key" },
  transport: { kind: "stdio", command: "npx", args: ["notes-mcp"], env: {} },
};

function contextWith(secret: string | null): ConnectorFactoryContext {
  return {
    secrets: { get: async () => secret },
    tokens: {} as never,
    http: {} as never,
    workspaceRoot: "/work/space",
    trust: { location: "/work/space", fingerprint: "hfp1:made-up" },
  };
}

/** A host that opens the connector, then fails its tools request with `error`. */
function failingHost(error: Record<string, unknown>): FakeHost {
  return new FakeHost()
    .answer("POST /v1/connectors/open", ok({ connector: "c1" }))
    .answer("POST /v1/connectors/tools", { status: 502, body: { error } });
}

async function listingFails(host: FakeHost, secret: string | null = "made-up-value") {
  const client = new AgentHostConnectorFactory(host).create(config, contextWith(secret));
  return await client.listTools().catch((error: unknown) => error);
}

const failed = {
  kind: "connector_failed",
  message: "The connector couldn't finish this request. The agent host's log has the detail.",
};

verifies("agent-host-client.connector-failure", () => {
  it.each([
    [{ reason: "program-missing", program: "npx" }, "unavailable"],
    [{ reason: "secret-missing", secret: "notes-key" }, "invalid_input"],
    [{ reason: "secret-refused" }, "unauthenticated"],
    [{ reason: "stopped" }, "unavailable"],
  ])("throws %o from the host as a kinded error of kind %s", async (reason, kind) => {
    const error = await listingFails(failingHost({ ...failed, ...reason }));
    expect(error).toBeInstanceOf(ConnectorFailedError);
    expect(errorKindOf(error)).toBe(kind);
    expect((error as ConnectorFailedError).failure).toEqual(reason);
    expect((error as ConnectorFailedError).cause).toMatchObject({
      status: 502,
      kind: "connector_failed",
    });
  });

  it("says the cause in a plain sentence", async () => {
    const error = await listingFails(
      failingHost({ ...failed, reason: "program-missing", program: "npx" }),
    );
    expect((error as Error).message).toBe("The program npx isn't on this computer.");
  });

  it("names a secret that isn't set the same way, without calling the host", async () => {
    const host = failingHost(failed);
    const error = await listingFails(host, null);
    expect(error).toBeInstanceOf(ConnectorFailedError);
    expect(errorKindOf(error)).toBe("invalid_input");
    expect((error as ConnectorFailedError).failure).toEqual({
      reason: "secret-missing",
      secret: "notes-key",
    });
    expect(host.calls).toEqual([]);
  });

  it("keeps a failure without a known reason an AgentHostError", async () => {
    for (const body of [failed, { ...failed, reason: "something-new" }]) {
      const error = await listingFails(failingHost(body));
      expect(error).toBeInstanceOf(AgentHostError);
      expect(error).toMatchObject({ status: 502, kind: "connector_failed" });
    }
  });
});
