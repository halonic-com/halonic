import type { OfferedTool, OutsideRunCall, SendingSettings } from "@halonicjs/app";
import type { ToolRisk } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ConnectorCallPorts, Server, TrustDecision } from "./api.ts";
import { FakePasswordHasher, testServer } from "./test-server.ts";

const trusted: TrustDecision = { state: "trusted", message: "Trusted." };
type Target = Omit<OutsideRunCall, "args">;

function tool(name: string, risk: ToolRisk): OfferedTool {
  return {
    kind: "declared",
    name,
    description: `Runs ${name}.`,
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      additionalProperties: false,
    },
    risk,
    untrusted: false,
  };
}

interface Seen {
  found: string[];
  called: unknown[];
  logged: unknown[];
}

function setup(
  options: {
    state?: TrustDecision;
    sending?: Awaited<ReturnType<SendingSettings["checkSending"]>>;
    lists?: Target["lists"];
    call?: () => Promise<string>;
    withPorts?: boolean;
    passwordHash?: string;
  } = {},
) {
  const seen: Seen = { found: [], called: [], logged: [] };
  const tools = new Map(
    (["read", "write", "send"] as const).map((risk) => [risk, tool(risk, risk)]),
  );
  const connectors: ConnectorCallPorts = {
    find: async (connector, name) => {
      seen.found.push(`${connector}/${name}`);
      const found = tools.get(name as ToolRisk);
      return found === undefined
        ? null
        : {
            connection: { location: "/w", connector },
            lists: options.lists ?? { approve: [] },
            tool: found,
          };
    },
    call: async (_target, args) => {
      seen.called.push(args);
      return options.call === undefined ? "done" : options.call();
    },
    settings: { checkSending: async () => options.sending ?? { allowed: true } },
  };
  const server = testServer({
    passwordHash: options.passwordHash ?? null,
    ...(options.passwordHash === undefined
      ? {}
      : {
          passwordHasher: new FakePasswordHasher(),
          config: { allowedHosts: ["halonic.acme.example"] },
        }),
    trust: { check: async () => options.state ?? trusted },
    errorLog: { record: (error) => seen.logged.push(error) },
    ...(options.withPorts === false ? {} : { connectors }),
  });
  return { server, seen };
}

function call(server: Server, body: unknown, type = "application/json", host = "localhost") {
  return server.handle(
    new Request("http://localhost/api/connector-calls", {
      method: "POST",
      headers: { host, ...(type === "" ? {} : { "content-type": type }) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const read = { connector: "mail", tool: "read", arguments: { query: "invoices" } };

async function refusedWith(response: Response, code: string, status: number) {
  expect(response.status).toBe(status);
  const body = (await response.json()) as { code: string; message: string };
  expect(body.code).toBe(code);
  return body.message;
}

describe("connector call route", () => {
  verifies("server.outside-run-connector-gate", () => {
    it("runs a read tool the lists allow and answers its result", async () => {
      const { server, seen } = setup({ lists: { allow: ["read"], approve: [] } });
      const response = await call(server, read);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ result: "done" });
      expect(seen.called).toEqual([{ query: "invoices" }]);
    });

    it("refuses a write tool that isn't under approve, and a send tool with sending on", async () => {
      const { server, seen } = setup({ sending: { allowed: true } });
      for (const name of ["write", "send"]) {
        const response = await call(server, { ...read, tool: name });
        expect(await refusedWith(response, "connector_call_refused", 403)).not.toBe("");
      }
      expect(seen.called).toEqual([]);
    });

    it("refuses a call with no session when a password is set, and asks the host nothing", async () => {
      const { server, seen } = setup({ passwordHash: "hash:correct horse" });
      const response = await call(server, read, "application/json", "halonic.acme.example");
      expect(response.status).toBe(401);
      expect(seen.found).toEqual([]);
      expect(seen.called).toEqual([]);
    });

    it("answers 400 to a name over 256 bytes and takes one of 256", async () => {
      const { server, seen } = setup();
      expect((await call(server, { ...read, tool: "t".repeat(257) })).status).toBe(400);
      expect(seen.found).toEqual([]);
      expect((await call(server, { ...read, tool: "t".repeat(256) })).status).toBe(404);
      expect(seen.found).toEqual([`mail/${"t".repeat(256)}`]);
    });

    it("refuses an approve-listed read tool and a tool the allow list leaves out", async () => {
      for (const lists of [{ approve: ["read"] }, { allow: ["other"], approve: [] }]) {
        const { server, seen } = setup({ lists });
        const response = await call(server, read);
        expect(response.status).toBe(403);
        expect(((await response.json()) as { code: string }).code).toBe("connector_call_refused");
        expect(seen.called).toEqual([]);
      }
      const all = setup({ lists: { approve: "all" } });
      expect((await call(all.server, read)).status).toBe(403);
      expect(all.seen.called).toEqual([]);
    });

    it("refuses an argument the tool's parameters don't name", async () => {
      const { server, seen } = setup();
      const response = await call(server, { ...read, arguments: { query: "x", path: "/etc" } });
      expect(response.status).toBe(403);
      expect(seen.called).toEqual([]);
    });

    it("keeps the store's error out of the reply and logs it", async () => {
      const storeError = new Error("cannot read the profile folder");
      const { server, seen } = setup({
        sending: {
          allowed: false,
          reason: "the settings of the connector can't be read",
          error: storeError,
        },
      });
      const response = await call(server, { ...read, tool: "send" });
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain("the profile folder");
      expect(seen.logged).toEqual([storeError]);
      expect(seen.called).toEqual([]);
    });

    it("asks nothing and runs nothing in an untrusted workspace", async () => {
      for (const state of ["new", "changed", "unreadable", "refused"] as const) {
        const { server, seen } = setup({ state: { state, message: "no" } });
        const response = await call(server, read);
        expect(response.status).toBe(403);
        expect(((await response.json()) as { code: string }).code).toBe("workspace_not_trusted");
        expect(seen.found).toEqual([]);
      }
    });

    it("refuses a bad body and a form post before the host is asked", async () => {
      const { server, seen } = setup();
      const bad = [
        "{nope",
        {},
        { ...read, extra: 1 },
        { ...read, tool: "" },
        { ...read, arguments: [] },
      ];
      for (const body of bad) expect((await call(server, body)).status).toBe(400);
      for (const type of ["text/plain", "application/x-www-form-urlencoded", ""]) {
        expect((await call(server, read, type)).status).toBe(415);
      }
      expect(seen.found).toEqual([]);
    });

    it("answers 404 for an unknown tool and when the host offers no connector calls", async () => {
      const { server } = setup();
      const unknown = await call(server, { ...read, tool: "nope" });
      expect(unknown.status).toBe(404);
      expect(((await unknown.json()) as { code: string }).code).toBe("connector_tool_not_found");
      expect((await call(setup({ withPorts: false }).server, read)).status).toBe(404);
    });

    it("answers a failing tool with a fixed 502 and logs the cause", async () => {
      const cause = new Error("boom at /srv/secret");
      const { server, seen } = setup({
        call: async () => {
          throw cause;
        },
      });
      const response = await call(server, read);
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain("/srv/secret");
      expect(seen.logged).toEqual([cause]);
    });
  });
});
