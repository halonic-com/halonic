import type { Connector } from "@halonicjs/format";
import { deepEqual } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { trustContent } from "./trust-content.ts";

/** `${NAME}` as written in a workspace file, which Halonic never expands. */
const variable = (name: string) => `\${${name}}`;

type StdioSettings = Extract<Connector["transport"], { stdio: unknown }>["stdio"];

function stdio(settings: Partial<StdioSettings> = {}, fields: Partial<Connector> = {}): Connector {
  return {
    version: 1,
    id: "files",
    transport: { stdio: { command: "node", args: ["server.js"], cwd: ".", ...settings } },
    tools: { approve: ["delete_file"] },
    ...fields,
  };
}

function http(url = "https://mcp.acme.test/v1/mcp", fields: Partial<Connector> = {}): Connector {
  return {
    version: 1,
    id: "files",
    transport: { http: { url, headers: { accept: "application/json" } } },
    secret: "files-token",
    tools: { approve: ["delete_file"] },
    ...fields,
  };
}

/** Whether two workspaces have the same trust content, so the same fingerprint. */
function same(before: Connector[], after: Connector[]): boolean {
  return deepEqual(trustContent({ connectors: before }), trustContent({ connectors: after }));
}

verifies("workspace.trust-content", () => {
  describe("a program", () => {
    it("holds the command, its path, the arguments as a list, the folder and every variable", () => {
      const connector = stdio(
        { env: { DATA: `${variable("HOME")}/acme` }, secretEnv: { API_KEY: "files-key" } },
        { name: "Files", description: "Reads files." },
      );
      const content = trustContent({
        connectors: [connector],
        commandPaths: new Map([["node", "/usr/bin/node"]]),
      });
      expect(content).toEqual({
        connectors: [
          {
            version: 1,
            id: "files",
            transport: "stdio",
            settings: {
              command: "node",
              path: "/usr/bin/node",
              args: ["server.js"],
              cwd: ".",
              env: { DATA: `${variable("HOME")}/acme` },
              secretEnv: { API_KEY: "‹secret files-key›" },
            },
            tools: { approve: ["delete_file"] },
          },
        ],
      });
    });

    it("changes when a variable such as NODE_OPTIONS, PYTHONSTARTUP or LD_PRELOAD is added", () => {
      for (const name of ["NODE_OPTIONS", "PYTHONSTARTUP", "LD_PRELOAD"]) {
        expect(same([stdio()], [stdio({ env: { [name]: "./x" } })])).toBe(false);
      }
      expect(same([stdio()], [stdio({ secretEnv: { NODE_OPTIONS: "files-key" } })])).toBe(false);
    });

    it("holds the names taken from the app's environment, sorted, only when it names one", () => {
      const settingsOf = (connector: ReturnType<typeof stdio>) =>
        trustContent({ connectors: [connector], commandPaths: new Map() }).connectors[0]?.settings;
      expect(settingsOf(stdio({ inheritEnv: ["KUBECONFIG", "AWS_PROFILE"] }))).toMatchObject({
        inheritEnv: ["AWS_PROFILE", "KUBECONFIG"],
      });
      expect(settingsOf(stdio())).not.toHaveProperty("inheritEnv");
      expect(settingsOf(stdio({ inheritEnv: [] }))).not.toHaveProperty("inheritEnv");
      expect(same([stdio()], [stdio({ inheritEnv: [] })])).toBe(true);
      expect(same([stdio()], [stdio({ inheritEnv: ["AWS_PROFILE"] })])).toBe(false);
      expect(same([stdio({ inheritEnv: ["A", "B"] })], [stdio({ inheritEnv: ["B", "A"] })])).toBe(
        true,
      );
    });

    it("holds the sites in their stored form, sorted, only when written", () => {
      const settingsOf = (connector: ReturnType<typeof stdio>) =>
        trustContent({ connectors: [connector], commandPaths: new Map() }).connectors[0]?.settings;
      expect(
        settingsOf(stdio({ sites: ["bücher.example.com", "API.example.com", "api.example.com"] })),
      ).toMatchObject({ sites: ["api.example.com", "xn--bcher-kva.example.com"] });
      expect(settingsOf(stdio())).not.toHaveProperty("sites");
      expect(same([stdio()], [stdio({ sites: [] })])).toBe(false);
      expect(
        same([stdio({ sites: ["a.example.com"] })], [stdio({ sites: ["b.example.com"] })]),
      ).toBe(false);
      expect(
        same(
          [stdio({ sites: ["a.example.com", "B.example.com"] })],
          [stdio({ sites: ["b.example.com", "a.example.com"] })],
        ),
      ).toBe(true);
    });

    it("changes when the folder, the command or an argument changes", () => {
      expect(same([stdio()], [stdio({ cwd: "./tools/../scripts" })])).toBe(false);
      expect(same([stdio()], [stdio({ command: "bash" })])).toBe(false);
      expect(same([stdio({ args: ["a b"] })], [stdio({ args: ["a", "b"] })])).toBe(false);
    });

    it("stays the same for a folder written another way", () => {
      expect(same([stdio({ cwd: "./tools/.." })], [stdio({ cwd: "." })])).toBe(true);
      expect(same([stdio({ cwd: undefined })], [stdio({ cwd: "." })])).toBe(true);
    });
  });

  describe("a remote server", () => {
    it("holds the full URL, the headers and the secret's name only", () => {
      const [content] = trustContent({ connectors: [http("HTTPS://MCP.Acme.test")] }).connectors;
      expect(content?.settings).toEqual({
        url: "https://mcp.acme.test/",
        headers: { accept: "application/json" },
      });
      expect(content?.secret).toBe("‹secret files-token›");
    });

    it("changes when the path, scheme, port or query changes on the same host", () => {
      for (const url of [
        "https://mcp.acme.test/v1/admin",
        "http://mcp.acme.test/v1/mcp",
        "https://mcp.acme.test:8443/v1/mcp",
        "https://mcp.acme.test/v1/mcp?as=admin",
        "https://mcp.асme.test/v1/mcp",
      ]) {
        expect(same([http()], [http(url)])).toBe(false);
      }
    });

    it("changes when the same connector switches transport", () => {
      expect(same([http()], [stdio()])).toBe(false);
    });

    it("stays the same for a host in capitals, Unicode or Punycode", () => {
      expect(same([http("https://Bücher.example/")], [http("https://xn--bcher-kva.example")])).toBe(
        true,
      );
    });
  });

  describe("approvals and the rest of the file", () => {
    it("changes when a tool stops asking, the offered list grows or a server becomes local", () => {
      expect(same([stdio()], [stdio({}, { tools: { approve: [] } })])).toBe(false);
      const listed = stdio({}, { tools: { allow: ["read_file"], approve: [] } });
      expect(same([listed], [stdio({}, { tools: { approve: [] } })])).toBe(false);
      expect(same([http()], [http(undefined, { local: true })])).toBe(false);
    });

    it("changes when `approve: all` becomes a list, even one that names every tool", () => {
      const everyTool = stdio({}, { tools: { approve: "all" } });
      expect(same([everyTool], [stdio({}, { tools: { approve: ["delete_file"] } })])).toBe(false);
      expect(same([everyTool], [stdio({}, { tools: { approve: "all" } })])).toBe(true);
    });

    it("stays the same when only the order of tools or connectors, the name or the description changes", () => {
      const a = stdio({}, { tools: { approve: ["a", "b"] } });
      const b = stdio({}, { tools: { approve: ["b", "a"] }, name: "Files", description: "New" });
      expect(same([a], [b])).toBe(true);
      const mail = { ...http(), id: "mail" };
      expect(same([stdio(), mail], [mail, stdio()])).toBe(true);
    });

    it("keeps a field the schema doesn't know yet as written, under unknown", () => {
      const withRisk = { ...stdio(), risk: "read" } as Connector;
      expect(trustContent({ connectors: [withRisk] }).connectors[0]).toMatchObject({
        unknown: { risk: "read" },
      });
      expect(same([stdio()], [withRisk])).toBe(false);
      const toolField = stdio(
        {},
        { tools: { approve: [], autoApprove: true } as Connector["tools"] },
      );
      expect(trustContent({ connectors: [toolField] }).connectors[0]?.tools).toEqual({
        approve: [],
        unknown: { autoApprove: true },
      });
      expect(same([stdio({}, { tools: { approve: [] } })], [toolField])).toBe(false);
    });

    it("never lets an unknown field take the place of a known one", () => {
      const settings = { ...stdio(), settings: { command: "rm" } } as Connector;
      const content = trustContent({ connectors: [settings] }).connectors[0];
      expect(content?.settings).toMatchObject({ command: "node" });
      expect(content?.unknown).toEqual({ settings: { command: "rm" } });
      expect(same([stdio()], [settings])).toBe(false);

      // A `path` written in the file must not look like the path the command resolves to.
      const path = stdio({ path: "/usr/bin/node" } as Partial<StdioSettings>);
      const resolved = trustContent({
        connectors: [stdio()],
        commandPaths: new Map([["node", "/usr/bin/node"]]),
      });
      expect(trustContent({ connectors: [path] }).connectors[0]?.settings).toMatchObject({
        unknown: { path: "/usr/bin/node" },
      });
      expect(deepEqual(trustContent({ connectors: [path] }), resolved)).toBe(false);

      const transport = {
        ...http(),
        transport: { http: { url: "https://mcp.acme.test/v1/mcp", transport: "stdio" } },
      } as unknown as Connector;
      expect(trustContent({ connectors: [transport] }).connectors[0]).toMatchObject({
        transport: "http",
        settings: { unknown: { transport: "stdio" } },
      });
    });

    it("keeps a transport the schema doesn't know yet, with its settings", () => {
      const future = {
        ...stdio(),
        transport: { socket: { path: "run/mcp.sock" } },
      } as unknown as Connector;
      expect(trustContent({ connectors: [future] }).connectors[0]).toMatchObject({
        transport: "socket",
        settings: { value: { path: "run/mcp.sock" } },
      });
    });

    it("holds the Google account the connector acts as", () => {
      const google: Connector = {
        version: 1,
        id: "mail",
        transport: { google: { account: "office@acme.test", client: "google" } },
        tools: { approve: [] },
      };
      expect(trustContent({ connectors: [google] }).connectors[0]?.settings).toEqual({
        account: "office@acme.test",
        client: "google",
      });
    });
  });

  describe("a URL that can't be trusted", () => {
    it("refuses the connector, without its URL, instead of normalising it", () => {
      const sneaky = { ...http("https://evil.test\\@mcp.acme.test/"), id: "sneaky" };
      const password = { ...http("https://ops:pw@mcp.acme.test/"), id: "password" };
      const content = trustContent({ connectors: [sneaky, stdio(), password] });
      expect(content.connectors.map((connector) => connector.id)).toEqual(["files"]);
      expect(content.refused).toEqual([
        { id: "password", reason: "the URL has user info" },
        { id: "sneaky", reason: "the URL has a backslash before its query" },
      ]);
      expect(JSON.stringify(content)).not.toContain("pw");
    });

    it("leaves refused out when every connector can be trusted", () => {
      expect(trustContent({ connectors: [http()] })).not.toHaveProperty("refused");
    });
  });
});
