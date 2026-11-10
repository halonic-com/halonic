import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorTool,
  TrustGrant,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { refuseRealNetwork } from "./connector-network.ts";

/**
 * The tools the contract's test server offers over `http` and `stdio`: one
 * per risk, one without a risk, and one that always fails. A binding's
 * server lists exactly these and answers with {@link contractServerAnswer}.
 */
export const contractServerTools: readonly ConnectorTool[] = [
  {
    name: "read_note",
    description: "Reads one note.",
    parameters: { type: "object", properties: { id: { type: "string" } } },
    risk: "read",
  },
  {
    name: "update_note",
    description: "Changes one note.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, text: { type: "string" } },
    },
    risk: "write",
  },
  {
    name: "send_note",
    description: "Sends one note to someone outside.",
    parameters: { type: "object", properties: { to: { type: "string" } } },
    risk: "send",
    untrusted: true,
  },
  {
    name: "tidy_notes",
    description: "Tidies the notes. The server says nothing about its risk.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "broken_note",
    description: "Always fails, as a tool error.",
    parameters: { type: "object", properties: {} },
    risk: "read",
  },
];

/** The tool in {@link contractServerTools} whose every call fails. */
export const brokenToolName = "broken_note";

/** What the test server answers for a call: the tool and its args, so the suite sees both arrived unchanged. */
export function contractServerAnswer(name: string, args: Record<string, unknown>): string {
  return `${name} ${JSON.stringify(args)}`;
}

/** A tool call that reached the server, or the service behind a built-in connector. */
export interface ReachedCall {
  name: string;
  args: Record<string, unknown>;
}

/** One connector under test, before the suite creates its client. */
export interface ConnectorHarness {
  factory: ConnectorFactory;
  /**
   * For `http` and `stdio`, a connector whose server offers
   * {@link contractServerTools}. For `google`, the built-in connector for
   * one account, answered from recorded responses.
   */
  config: ConnectorConfig;
  /** What the factory is given, except `trust`, which the suite sets. */
  context: Omit<ConnectorFactoryContext, "trust">;
  /** Every tool call that reached the server or the service so far, in order. */
  reached(): readonly ReachedCall[];
  /** How many programs `stdio` connectors started so far, and how many still run. Zeros for other kinds. */
  programs(): { started: number; running: number };
  /** `google` only: a call to one of its `read` tools that the recorded responses answer. */
  readCall?: ReachedCall;
}

/** Creates a fresh connector under test: nothing reached, no program started. */
export type MakeConnector = () => Promise<ConnectorHarness>;

/** The grant the suite hands out when a case needs the workspace trusted. */
export const contractGrant: TrustGrant = {
  location: "/workspaces/acme",
  fingerprint: "hfp1:contract",
};

/** A connector under test with its client, created with or without a grant. */
interface Created {
  harness: ConnectorHarness;
  client: ConnectorClient;
}

async function create(make: MakeConnector, trust: TrustGrant | null): Promise<Created> {
  const harness = await make();
  const client = harness.factory.create(harness.config, { ...harness.context, trust });
  return { harness, client };
}

/** The transport kinds a connector factory serves. */
export type ConnectorKind = ConnectorConfig["transport"]["kind"];

/**
 * The contract every {@link ConnectorFactory} adapter passes, for the
 * transport kind it serves: the trust-grant rules of
 * `ports.connector-trust-enforcement`, tools passed through as the server
 * wrote them, calls, and closing. No case may reach the real network:
 * a connector reaches its service only through the context's `http`.
 */
export function connectorClientContract(
  name: string,
  kind: ConnectorKind,
  make: MakeConnector,
): void {
  verifies("contracts.connector-client", () => {
    describe(`ConnectorClient contract: ${name} (${kind})`, () => {
      refuseRealNetwork();
      commonCases(kind, make);
      if (kind === "http" || kind === "stdio") serverCases(make);
      if (kind === "http") httpCases(make);
      if (kind === "stdio") stdioCases(make);
      if (kind === "google") googleCases(make);
    });
  });
  verifies("contracts.connector-call-hints", () => {
    describe(`ConnectorClient call hints: ${name} (${kind})`, () => {
      refuseRealNetwork();
      hintCases(kind, make);
    });
  });
}

/** Creates a client, runs `body` with it, and always closes it. */
async function withClient(
  make: MakeConnector,
  trust: TrustGrant | null,
  body: (created: Created) => Promise<void>,
): Promise<void> {
  const created = await create(make, trust);
  try {
    await body(created);
  } finally {
    await created.client.close();
  }
}

function commonCases(kind: ConnectorKind, make: MakeConnector): void {
  it("serves the transport kind of its config, under the config's id", async () => {
    const { harness, client } = await create(make, contractGrant);
    expect(harness.factory.transport).toBe(kind);
    expect(harness.config.transport.kind).toBe(kind);
    expect(client.id).toBe(harness.config.id);
  });

  it("can be closed twice, also before it ever connected", async () => {
    const { harness, client } = await create(make, contractGrant);
    await client.close();
    await client.close();
    expect(harness.programs().running).toBe(0);
  });
}

function serverCases(make: MakeConnector): void {
  it("lists the server's tools as it wrote them, risk and untrusted included", () =>
    withClient(make, contractGrant, async ({ client }) => {
      expect(await client.listTools()).toEqual(contractServerTools);
    }));

  it("passes a call's tool and args through unchanged and returns the server's text", () =>
    withClient(make, contractGrant, async ({ harness, client }) => {
      const args = { id: "n-1", text: "Grüße 🫖", nested: { list: [1, null, true] } };
      expect(await client.callTool("update_note", args)).toBe(
        contractServerAnswer("update_note", args),
      );
      expect(harness.reached()).toEqual([{ name: "update_note", args }]);
    }));

  it("throws when the tool fails, and for a tool the server doesn't have", () =>
    withClient(make, contractGrant, async ({ client }) => {
      await expect(client.callTool(brokenToolName, {})).rejects.toThrow();
      await expect(client.callTool("no_such_tool", {})).rejects.toThrow();
    }));
}

function httpCases(make: MakeConnector): void {
  it("without a grant, still lists an http connector's tools but calls none, not even read ones", () =>
    withClient(make, null, async ({ harness, client }) => {
      expect(await client.listTools()).toEqual(contractServerTools);
      for (const tool of contractServerTools) {
        await expect(client.callTool(tool.name, { id: "n-1" })).rejects.toThrow();
      }
      expect(harness.reached()).toEqual([]);
    }));
}

function stdioCases(make: MakeConnector): void {
  it("without a grant, never starts a stdio connector's program", () =>
    withClient(make, null, async ({ harness, client }) => {
      await expect(client.listTools()).rejects.toThrow();
      await expect(client.callTool("read_note", { id: "n-1" })).rejects.toThrow();
      expect(harness.programs()).toEqual({ started: 0, running: 0 });
      expect(harness.reached()).toEqual([]);
    }));

  it("starts the program on the first call only, once, and stops it on close", () =>
    withClient(make, contractGrant, async ({ harness, client }) => {
      expect(harness.programs()).toEqual({ started: 0, running: 0 });
      await client.listTools();
      await client.callTool("read_note", { id: "n-1" });
      await client.callTool("read_note", { id: "n-2" });
      expect(harness.programs()).toEqual({ started: 1, running: 1 });
      await client.close();
      expect(harness.programs()).toEqual({ started: 1, running: 0 });
    }));
}

function googleCases(make: MakeConnector): void {
  it("gives every built-in Google tool its own risk", () =>
    withClient(make, contractGrant, async ({ client }) => {
      const tools = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) expect(["read", "write", "send"]).toContain(tool.risk);
    }));

  it("without a grant, calls Google read tools only", () =>
    withClient(make, null, async ({ harness, client }) => {
      const readCall = harness.readCall;
      if (readCall === undefined) throw new TypeError("a google binding gives a readCall");
      for (const tool of await client.listTools()) {
        if (tool.risk === "read") continue;
        await expect(client.callTool(tool.name, readCall.args)).rejects.toThrow();
      }
      expect(harness.reached()).toEqual([]);
      expect(typeof (await client.callTool(readCall.name, readCall.args))).toBe("string");
      expect(harness.reached()).toEqual([readCall]);
    }));
}

/** The hint a run passes when a person has it try a call again. */
const contractHint = { idempotencyKey: "r-acme:call-2" };

/** An adapter may use a hint or ignore it, but the call works the same either way. */
function hintCases(kind: ConnectorKind, make: MakeConnector): void {
  it("answers a call with an idempotency key as it answers one without", () =>
    withClient(make, contractGrant, async ({ harness, client }) => {
      const call = callWithAnswer(kind, harness);
      const answer = await client.callTool(call.name, call.args, contractHint);
      expect(answer).toBe(await client.callTool(call.name, call.args));
      expect(harness.reached()).toEqual([call, call]);
    }));
}

/** A call the connector under test answers: `update_note` on the contract's server, or Google's `readCall`. */
function callWithAnswer(kind: ConnectorKind, harness: ConnectorHarness): ReachedCall {
  if (kind !== "google") return { name: "update_note", args: { id: "n-1", text: "Hi" } };
  if (harness.readCall === undefined) throw new TypeError("a google binding gives a readCall");
  return harness.readCall;
}
