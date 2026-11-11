import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import type { ConnectorConfig, HttpClient, Secrets, TrustGrant } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { contractServer } from "../stdio/fake-program.spec.ts";
import { FakeMcpHttpServer } from "./fake-http-server.spec.ts";
import { McpHttpConnectorFactory } from "./http-connector.ts";

const grant: TrustGrant = { location: "/workspaces/acme", fingerprint: "hfp1:acme" };
const factory = new McpHttpConnectorFactory({ clientInfo: { name: "halonic", version: "0.1.0" } });
const notes: ConnectorConfig = {
  id: "notes",
  transport: { kind: "http", url: "https://notes.acme.test/mcp", headers: { "x-acme": "1" } },
  secret: "notes-token",
  secretEnv: {},
};

function connect(http: HttpClient, secrets: Secrets, trust: TrustGrant | null = grant) {
  return factory.create(notes, { secrets, tokens: new MemoryTokenStore(), http, trust });
}

function secretsWith(token: string): MemorySecrets {
  return new MemorySecrets({ "notes-token": token });
}

verifies("mcp.http-connector", () => {
  describe("McpHttpConnectorFactory", () => {
    it("sends the secret as a bearer token in the header only, next to the connector's headers", async () => {
      const server = new FakeMcpHttpServer(contractServer([]));
      const client = connect(server, secretsWith("acme-token"));
      await client.listTools();
      for (const request of server.requests) {
        expect(request.headers.get("authorization")).toBe("Bearer acme-token");
        expect(request.headers.get("x-acme")).toBe("1");
      }
      expect(JSON.stringify(server.messages())).not.toContain("acme-token");
      await client.close();
    });

    it("refuses a secret that isn't set, naming it, and tries again on the next call", async () => {
      const server = new FakeMcpHttpServer(contractServer([]));
      const values: Record<string, string> = {};
      const client = connect(server, { get: async (name) => values[name] ?? null });
      await expect(client.listTools()).rejects.toThrow('needs the secret "notes-token"');
      expect(server.requests).toEqual([]);
      values["notes-token"] = "acme-token";
      expect(await client.listTools()).not.toEqual([]);
      await client.close();
    });

    it("without a grant, refuses a call before sending anything", async () => {
      const server = new FakeMcpHttpServer(contractServer([]));
      const client = connect(server, secretsWith("acme-token"), null);
      await expect(client.callTool("read_note", {})).rejects.toThrow(
        "once the workspace is trusted",
      );
      expect(server.requests).toEqual([]);
      await client.close();
    });

    it("starts a new session after the server forgot the old one", async () => {
      const server = new FakeMcpHttpServer(contractServer([]), "json", "session-1");
      let forgotten = false;
      const http: HttpClient = {
        fetch: async (url, init) => {
          const expired = forgotten && new Headers(init?.headers).get("mcp-session-id") !== null;
          forgotten = false;
          return expired ? new Response(null, { status: 404 }) : server.fetch(url, init);
        },
      };
      const client = connect(http, secretsWith("acme-token"));
      await client.listTools();
      forgotten = true;
      await expect(client.listTools()).rejects.toMatchObject({ code: "session-expired" });
      expect(await client.listTools()).not.toEqual([]);
      const initializes = server.messages().filter((message) => message["method"] === "initialize");
      expect(initializes).toHaveLength(2);
      await client.close();
    });

    it("ends the session on close and refuses calls after it", async () => {
      const server = new FakeMcpHttpServer(contractServer([]), "json", "session-1");
      const client = connect(server, secretsWith("acme-token"));
      await client.listTools();
      await client.close();
      expect(server.requests.at(-1)?.method).toBe("DELETE");
      await expect(client.listTools()).rejects.toThrow('Connector "notes" is closed.');
    });

    it("refuses a connector of another transport", () => {
      const stdio: ConnectorConfig = {
        id: "notes",
        transport: { kind: "stdio", command: "notes-mcp", args: [], env: {} },
        secretEnv: {},
      };
      const context = {
        secrets: new MemorySecrets(),
        tokens: new MemoryTokenStore(),
        http: new FakeMcpHttpServer(contractServer([])),
        trust: grant,
      };
      expect(() => factory.create(stdio, context)).toThrow("this factory serves http");
    });
  });
});
