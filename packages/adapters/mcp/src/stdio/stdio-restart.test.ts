import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import type { ConnectorConfig, ConnectorFactoryContext, ConnectorPin } from "@halonicjs/ports";
import type { Clock } from "@halonicjs/std";
import {
  contractGrant,
  type ReachedCall,
  RecordedRegistryClient,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { runnerComputer } from "../pinned/fake-runners.spec.ts";
import { keyLineRemoved } from "./error-output.ts";
import { contractServer, FakeFolders, type FakeHandler, FakeStarter } from "./fake-program.spec.ts";
import { McpStdioConnectorFactory } from "./stdio-connector.ts";
import { ConnectorStoppedError } from "./stopped-error.ts";

const pin: ConnectorPin = {
  registry: "npm",
  registryUrl: "https://registry.npmjs.org",
  package: "@acme/mail-mcp",
  version: "2.3.1",
};

const config: ConnectorConfig = {
  id: "mail",
  transport: { kind: "stdio", command: "npx", args: ["-y", "@acme/mail-mcp"], env: {}, pin },
  secretEnv: { MAIL_TOKEN: "mail-token" },
};

const secretValue = "value-from-secrets";
const tenMinutes = 10 * 60 * 1000;

/** A clock that moves only when a test moves it. */
class ManualClock implements Clock {
  #time = Date.UTC(2026, 10, 10, 9, 0);

  now(): Date {
    return new Date(this.#time);
  }

  advance(ms: number): void {
    this.#time += ms;
  }
}

/** The contract server, except that it ends on its own when `crashes` says so. */
function crashingServer(
  reached: ReachedCall[],
  crashes: (message: Record<string, unknown>) => boolean,
): FakeHandler {
  const server = contractServer(reached);
  return (message, program) => {
    if (!crashes(message)) {
      server(message, program);
      return;
    }
    if (message["method"] === "tools/call") {
      const params = message["params"] as { name: string; arguments: Record<string, unknown> };
      reached.push({ name: params.name, args: params.arguments });
    }
    program.exit(1);
  };
}

function setUp(handler: (reached: ReachedCall[]) => FakeHandler) {
  const reached: ReachedCall[] = [];
  const starter = new FakeStarter(handler(reached));
  const folders = new FakeFolders();
  const clock = new ManualClock();
  const http = new RecordedRegistryClient();
  const lookups = vi.spyOn(http, "fetch");
  const factory = new McpStdioConnectorFactory({
    starter,
    folders,
    runners: runnerComputer,
    inheritedEnv: { PATH: "/usr/bin", HOME: "/acme/home/acme-user", USER: "acme-user" },
    clientInfo: { name: "halonic", version: "0.1.0" },
    clock,
  });
  const context: ConnectorFactoryContext = {
    secrets: new MemorySecrets({ "mail-token": secretValue }),
    tokens: new MemoryTokenStore(),
    http,
    workspaceRoot: "/workspaces/acme",
    trust: contractGrant,
  };
  const client = factory.create(config, context);
  return { client, starter, folders, clock, reached, lookups };
}

verifies("mcp.stdio-restart", () => {
  describe("a program that stops during a call", () => {
    it("fails that call clearly and doesn't send it again", async () => {
      const { client, starter, reached } = setUp((reached) =>
        crashingServer(reached, (message) => message["method"] === "tools/call"),
      );
      await client.listTools();
      const error = await client.callTool("read_note", { text: "hi" }).catch((caught) => caught);
      expect(error).toMatchObject({ name: "McpError", code: "unavailable" });
      expect(error.message).toContain(
        'Connector "mail" lost its program while its tool "read_note" ran.',
      );
      expect(error.message).toContain("Halonic didn't try the call again");
      expect(reached).toEqual([{ name: "read_note", args: { text: "hi" } }]);
      expect(starter.counts()).toEqual({ started: 1, running: 0 });
      await client.close();
    });

    it("starts the program again on the next call, through the pin check and a new folder", async () => {
      let crashed = false;
      const { client, starter, folders, lookups } = setUp((reached) =>
        crashingServer(reached, (message) => {
          if (message["method"] !== "tools/call" || crashed) return false;
          crashed = true;
          return true;
        }),
      );
      await expect(client.callTool("read_note", { text: "first" })).rejects.toThrow(
        "lost its program",
      );
      const lookupsBefore = lookups.mock.calls.length;
      await expect(client.callTool("read_note", { text: "second" })).resolves.toContain("second");
      expect(starter.counts()).toEqual({ started: 2, running: 1 });
      // The registry was asked again, and the dead program's folder is gone.
      expect(lookups.mock.calls.length).toBeGreaterThan(lookupsBefore);
      expect(folders.present()).toEqual(["/acme/launch/halonic-connector-2"]);
      expect(starter.programs[1]?.launch.args).toContain("@acme/mail-mcp@2.3.1");
      await client.close();
      expect(folders.present()).toEqual([]);
    });

    it("starts one program, not two, for calls that arrive together after a stop", async () => {
      let crashed = false;
      const { client, starter } = setUp((reached) =>
        crashingServer(reached, (message) => {
          if (message["method"] !== "tools/call" || crashed) return false;
          crashed = true;
          return true;
        }),
      );
      await expect(client.callTool("read_note", { text: "first" })).rejects.toThrow(
        "lost its program",
      );
      await Promise.all([client.listTools(), client.listTools()]);
      expect(starter.counts()).toEqual({ started: 2, running: 1 });
      await client.close();
    });
  });

  describe("a program that keeps stopping", () => {
    /** Writes its error output, then ends as soon as it is asked to start. */
    const crashesAtStart = (reached: ReachedCall[]): FakeHandler => {
      const server = contractServer(reached);
      return (message, program) => {
        if (message["method"] !== "initialize") {
          server(message, program);
          return;
        }
        program.writeError("starting mail server\n");
        program.writeError(`token ${secretValue} rejected for ops@acme.test\n`);
        program.writeError(`config at /acme/home/acme-user/.mail, user acme-user\n`);
        program.writeError(`retry with sk-${"Ab1".repeat(8)}\n`);
        program.writeError("out of memory");
        program.exit(137);
      };
    };

    it("reports itself stopped after 3 restarts, with its last error output cleaned", async () => {
      const { client, starter, folders } = setUp(crashesAtStart);
      for (let start = 0; start < 4; start += 1) {
        await expect(client.listTools()).rejects.toMatchObject({ name: "McpError" });
      }
      const error = await client.listTools().catch((caught) => caught);
      expect(error).toBeInstanceOf(ConnectorStoppedError);
      expect(error.message).toBe(
        'Connector "mail" stopped: its program ended again after 3 restarts within 10 minutes, so Halonic doesn\'t start it again. It stays stopped until the connector is created again.',
      );
      expect(error.errorOutput).toEqual([
        "starting mail server",
        "token [secret removed] rejected for [e-mail removed]",
        "config at ~/.mail, user [user]",
        keyLineRemoved,
        "out of memory",
      ]);
      expect(JSON.stringify(error.errorOutput)).not.toContain(secretValue);
      expect(starter.counts()).toEqual({ started: 4, running: 0 });
      expect(folders.present()).toEqual([]);
    });

    it("stays stopped, even once the window has passed, and starts nothing more", async () => {
      const { client, starter, clock } = setUp(crashesAtStart);
      for (let start = 0; start < 4; start += 1) {
        await expect(client.listTools()).rejects.toThrow();
      }
      await expect(client.callTool("read_note", {})).rejects.toBeInstanceOf(ConnectorStoppedError);
      clock.advance(tenMinutes * 2);
      await expect(client.listTools()).rejects.toBeInstanceOf(ConnectorStoppedError);
      expect(starter.counts().started).toBe(4);
    });

    it("counts only the restarts within the last 10 minutes", async () => {
      const { client, starter, clock } = setUp(crashesAtStart);
      await expect(client.listTools()).rejects.toThrow();
      for (let restart = 0; restart < 3; restart += 1) {
        clock.advance(4 * 60 * 1000);
        await expect(client.listTools()).rejects.toThrow();
      }
      // The first restart was 12 minutes ago, so only two count.
      clock.advance(4 * 60 * 1000);
      await expect(client.listTools()).rejects.not.toBeInstanceOf(ConnectorStoppedError);
      expect(starter.counts().started).toBe(5);
    });
  });
});
