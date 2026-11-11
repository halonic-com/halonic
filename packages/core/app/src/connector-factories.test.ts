import type { Connector } from "@halonicjs/format";
import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorTool,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  ConnectorFactories,
  type ConnectorKind,
  connectorConfigOf,
} from "./connector-factories.ts";

const tools: ConnectorTool[] = [{ name: "read_note", description: "", parameters: {} }];

/** A factory that remembers what it created, and how each client was used. */
class FakeFactory implements ConnectorFactory {
  readonly created: { config: ConnectorConfig; context: ConnectorFactoryContext }[] = [];
  closed = 0;
  readonly transport: ConnectorKind;
  readonly #failListing: boolean;

  constructor(transport: ConnectorKind, failListing = false) {
    this.transport = transport;
    this.#failListing = failListing;
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    this.created.push({ config, context });
    return {
      id: config.id,
      listTools: async () => {
        if (this.#failListing) throw new Error("the server is down");
        return tools;
      },
      callTool: async () => "",
      close: async () => {
        this.closed += 1;
      },
    };
  }
}

const context: ConnectorFactoryContext = {
  secrets: { get: async () => null },
  tokens: { get: async () => null, set: async () => undefined, remove: async () => undefined },
  http: { fetch: async () => new Response("unused") },
  trust: { location: "/workspaces/acme", fingerprint: "hfp1:acme" },
};
const notes: ConnectorConfig = {
  id: "notes",
  transport: { kind: "stdio", command: "notes-mcp", args: [], env: {} },
  secretEnv: {},
};

/** A connector file as the workspace loads it, defaults filled in. */
function connectorFile(transport: Connector["transport"], secret?: string): Connector {
  return {
    version: 1,
    id: "notes",
    transport,
    ...(secret === undefined ? {} : { secret }),
    tools: { approve: [] },
  } as Connector;
}

verifies("app.connector-factories", () => {
  describe("ConnectorFactories", () => {
    it("creates each connector with the factory for its transport, context and grant unchanged", () => {
      const stdio = new FakeFactory("stdio");
      const http = new FakeFactory("http");
      const factories = new ConnectorFactories([stdio, http]);
      factories.create(notes, context);
      expect(stdio.created).toEqual([{ config: notes, context }]);
      expect(http.created).toEqual([]);
      expect(factories.serves("http")).toBe(true);
      expect(factories.serves("google")).toBe(false);
    });

    it("refuses a transport no factory serves, naming the connector, and a second factory for one kind", () => {
      const factories = new ConnectorFactories([new FakeFactory("http")]);
      expect(() => factories.create(notes, context)).toThrow('Connector "notes" uses stdio');
      expect(
        () => new ConnectorFactories([new FakeFactory("http"), new FakeFactory("http")]),
      ).toThrow(RangeError);
    });

    it("lists a connector's tools and closes it, also when the listing fails", async () => {
      const working = new FakeFactory("stdio");
      expect(await new ConnectorFactories([working]).listTools(notes, context)).toEqual(tools);
      expect(working.closed).toBe(1);
      const failing = new FakeFactory("stdio", true);
      await expect(new ConnectorFactories([failing]).listTools(notes, context)).rejects.toThrow(
        "the server is down",
      );
      expect(failing.closed).toBe(1);
    });
  });

  describe("connectorConfigOf", () => {
    it("takes an http connector's address, headers and secret", () => {
      const http = { http: { url: "https://notes.acme.test/mcp", headers: { "x-acme": "1" } } };
      expect(connectorConfigOf(connectorFile(http, "notes-token"))).toEqual({
        id: "notes",
        transport: { kind: "http", url: "https://notes.acme.test/mcp", headers: { "x-acme": "1" } },
        secret: "notes-token",
        secretEnv: {},
      });
    });

    it("takes a stdio connector's program, environment and folder, and never a pin", () => {
      const stdio = {
        stdio: {
          command: "npx",
          args: ["@acme/notes-mcp"],
          env: { LOG: "1" },
          secretEnv: { NOTES_TOKEN: "notes-token" },
          cwd: "tools",
        },
      };
      expect(connectorConfigOf(connectorFile(stdio))).toEqual({
        id: "notes",
        transport: {
          kind: "stdio",
          command: "npx",
          args: ["@acme/notes-mcp"],
          env: { LOG: "1" },
          cwd: "tools",
        },
        secretEnv: { NOTES_TOKEN: "notes-token" },
      });
    });

    it("takes a google connector's account and leaves out the secret it no longer names", () => {
      const google = { google: { account: "ada@acme.test", client: "google" } };
      expect(connectorConfigOf(connectorFile(google, "old-secret"))).toEqual({
        id: "notes",
        transport: { kind: "google", account: "ada@acme.test", client: "google" },
        secretEnv: {},
      });
    });
  });
});
