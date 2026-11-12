import type { Connector } from "@halonicjs/format";
import type { Clock, ConnectorPin, ConnectorTool, Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { approveWaitingTool } from "./approve-listed-tools.ts";
import {
  checkConnectorTools,
  connectorToolServer,
  hasToolApproval,
  revokeNamedTool,
} from "./connector-tool-check.ts";
import { stdioToolServer, writtenDigest } from "./listed-tool-fingerprint.ts";
import { TestToolApprovalStore } from "./testing/test-tool-approval-store.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const location = "/workspaces/acme";
const clock: Clock = { now: () => new Date("2026-11-11T09:00:00.000Z") };
const trust = { location, fingerprint: "hfp1:acme" };

function tool(name: string): ConnectorTool {
  return { name, description: `Runs ${name}.`, parameters: { type: "object" } };
}

function connector(transport: Connector["transport"]): Connector {
  return { version: 1, id: "notes-mcp", transport, tools: { approve: "all" } } as Connector;
}

verifies("app.listed-tool-review", () => {
  it("checks a stdio connector's listing against the approvals at its command", async () => {
    const store = new TestToolApprovalStore();
    const notes = connector({
      stdio: {
        command: "notes-mcp",
        args: ["--read-only"],
        cwd: "tools/notes",
        secretEnv: { NOTES_TOKEN: "notes-token" },
      },
    });
    const check = (listed: ConnectorTool[]) =>
      checkConnectorTools({ location, connector: notes, listed, trust, store, digest, clock });
    const first = await check([tool("lookup")]);
    if (!first.ok || first.value.waiting[0] === undefined) throw new Error("lookup waits");
    await approveWaitingTool(first.value, first.value.waiting[0], store, clock);

    const now = await check([tool("lookup"), tool("archive")]);

    expect(now.ok && now.value.tools.map((offered) => offered.name)).toEqual(["notes-mcp__lookup"]);
    expect(now.ok && now.value.waiting.map((waiting) => waiting.listedName)).toEqual(["archive"]);
    expect(now.ok && now.value.server).toEqual({
      kind: "stdio",
      command: "notes-mcp",
      args: ["--read-only"],
      pin: null,
      cwd: "tools/notes",
      env: null,
      secretEnv: await writtenDigest({ NOTES_TOKEN: "notes-token" }, digest),
    });
  });

  it("checks a wrapper at the variables it takes from the person's environment", async () => {
    const wrapper = connector({
      stdio: { command: "notes-wrapper", args: [], inheritEnv: ["PATH", "HOME"] },
    });
    const check = await checkConnectorTools({
      location,
      connector: wrapper,
      listed: [tool("lookup")],
      trust,
      store: new TestToolApprovalStore(),
      digest,
      clock,
    });
    expect(check.ok && check.value.server).toEqual(
      await stdioToolServer(
        { command: "notes-wrapper", args: [], env: {}, inheritEnv: ["PATH", "HOME"] },
        digest,
      ),
    );
    expect(check.ok && check.value.server).toMatchObject({ inheritEnv: ["HOME", "PATH"] });
  });

  it("checks a package runner at the pin from the trust record", async () => {
    const pin: ConnectorPin = {
      registry: "npm",
      registryUrl: "https://registry.npmjs.org",
      package: "@acme/notes-mcp",
      version: "2.3.1",
    };
    const runner = connector({ stdio: { command: "npx", args: ["@acme/notes-mcp"] } });
    const check = await checkConnectorTools({
      location,
      connector: runner,
      listed: [tool("lookup")],
      trust,
      pin,
      store: new TestToolApprovalStore(),
      digest,
      clock,
    });
    const atPin = await stdioToolServer(
      { command: "npx", args: ["@acme/notes-mcp"], env: {}, pin },
      digest,
    );
    expect(check.ok && check.value.server).toEqual(atPin);
    expect(await connectorToolServer(runner, pin, digest)).toEqual({ ok: true, value: atPin });
    expect(await connectorToolServer(runner, undefined, digest)).not.toEqual({
      ok: true,
      value: atPin,
    });
  });

  it("checks an http connector at its URL", async () => {
    const store = new TestToolApprovalStore();
    const notes = connector({ http: { url: "https://notes.example.com/mcp" } });
    const check = await checkConnectorTools({
      location,
      connector: notes,
      listed: [tool("lookup")],
      trust,
      store,
      digest,
      clock,
    });
    expect(check.ok && check.value.server).toEqual({
      kind: "http",
      url: "https://notes.example.com/mcp",
      headers: null,
    });
  });

  it("has nothing to check for a connector whose tools are built in", async () => {
    const google = connector({ google: { account: "fin@example.com", client: "google" } });
    const check = await checkConnectorTools({
      location,
      connector: google,
      listed: [],
      trust,
      store: new TestToolApprovalStore(),
      digest,
      clock,
    });
    expect(check.ok).toBe(false);
  });

  it("removes an approval by name, one that can't be read too, and says when there was none", async () => {
    const store = new TestToolApprovalStore();
    const notes = connector({ stdio: { command: "notes-mcp", args: [] } });
    const check = await checkConnectorTools({
      location,
      connector: notes,
      listed: [tool("lookup"), tool("send")],
      trust,
      store,
      digest,
      clock,
    });
    if (!check.ok) throw new Error("notes-mcp has a server address");
    for (const waiting of check.value.waiting) {
      await approveWaitingTool(check.value, waiting, store, clock);
    }
    store.breakApproval("send");
    const key = (name: string) => ({ location, source: "notes-mcp", name });
    expect(await hasToolApproval(store, key("lookup"))).toBe(true);
    expect(await hasToolApproval(store, key("send"))).toBe(true);
    expect(await hasToolApproval(store, key("archive"))).toBe(false);

    expect(await revokeNamedTool(store, key("lookup"))).toBe("revoked");
    expect(await revokeNamedTool(store, key("send"))).toBe("revoked");
    expect(await revokeNamedTool(store, key("archive"))).toBe("not_approved");
    expect(await store.list(location, "notes-mcp")).toEqual([]);
  });
});
