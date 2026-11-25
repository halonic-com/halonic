import type { Agent, Connector, Provider } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import type { LoadedFile, LoadedWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { deployReaches, hostOf } from "./deploy-reaches.ts";

function provider(id: string, fields: Partial<Provider>): LoadedFile {
  const value = { id, type: "anthropic", local: false, options: {}, ...fields } as Provider;
  return { path: `providers/${id}.yaml`, kind: "provider", hub: null, value };
}

function connector(id: string, transport: Connector["transport"], secret?: string): LoadedFile {
  const value = {
    version: 1,
    id,
    transport,
    tools: { approve: [] },
    ...(secret === undefined ? {} : { secret }),
  } as Connector;
  return { path: `connectors/${id}.connector.yaml`, kind: "connector", hub: null, value };
}

function workspace(...files: LoadedFile[]): LoadedWorkspace {
  return { files } as Partial<LoadedWorkspace> as LoadedWorkspace;
}

const crm = connector(
  "crm",
  { http: { url: "https://API.crm.example/mcp", headers: {} } },
  "crm-key",
);

verifies("app.deploy-reaches", () => {
  describe("the whole list", () => {
    it("pairs each provider and connector's address with the secret it sends there", () => {
      const found = deployReaches(
        workspace(
          provider("claude", { secret: "anthropic-key" }),
          crm,
          provider("test", { type: "mock" }),
        ),
      );
      expect(found).toEqual({
        kind: "reaches",
        reaches: [
          { address: "api.anthropic.com", secret: "anthropic-key" },
          { address: "api.crm.example", secret: "crm-key" },
        ],
        secretNames: ["anthropic-key", "crm-key"],
      });
    });

    it("uses a provider's own address when its file names one", () => {
      const found = deployReaches(
        workspace(
          provider("gw", { type: "openai-compatible", baseUrl: "https://llm.example:8443/v1" }),
        ),
      );
      expect(found).toEqual({
        kind: "reaches",
        reaches: [{ address: "llm.example", secret: undefined }],
        secretNames: [],
      });
    });

    it("lists an address and secret once, however many files name them", () => {
      const found = deployReaches(
        workspace(provider("a", { secret: "k" }), provider("b", { secret: "k" })),
      );
      expect(found).toMatchObject({ reaches: [{ address: "api.anthropic.com", secret: "k" }] });
    });

    it("reaches nothing with only the test model", () => {
      expect(deployReaches(workspace(provider("test", { type: "mock" })))).toEqual({
        kind: "reaches",
        reaches: [],
        secretNames: [],
      });
    });
  });

  describe("what can't run on Cloudflare (3.6)", () => {
    it("names every file and why, and gives no list", () => {
      const files = connector("files", {
        stdio: { command: "npx", args: [] },
      } as Connector["transport"]);
      const found = deployReaches(workspace(crm, files, provider("ollama", { type: "ollama" })));
      expect(found).toEqual({
        kind: "cannot-run",
        problems: [
          {
            path: "connectors/files.connector.yaml",
            reason: "The connector files starts a program, and Cloudflare can't start programs.",
            cause: "this-computer",
          },
          {
            path: "providers/ollama.yaml",
            reason: "The provider ollama is at localhost, which Cloudflare can't reach.",
            cause: "address",
          },
        ],
      });
    });

    it("stops for an address on a private network or marked local", () => {
      const found = deployReaches(
        workspace(
          provider("lan", { type: "openai-compatible", baseUrl: "http://192.168.1.20:11434/v1" }),
          provider("mine", { type: "openai", local: true }),
        ),
      );
      expect(found).toMatchObject({
        problems: [
          { reason: "The provider lan is at 192.168.1.20, which Cloudflare can't reach." },
          { reason: "The provider mine is at api.openai.com, which Cloudflare can't reach." },
        ],
      });
    });

    it("stops for a provider whose address it can't work out", () => {
      const found = deployReaches(workspace(provider("gw", { type: "openai-compatible" })));
      expect(found).toMatchObject({
        problems: [
          {
            reason:
              "The provider gw gives no address, so Halonic can't tell where it sends requests.",
            cause: "address",
          },
        ],
      });
    });

    it("stops for a connector that runs on this computer and for a harness agent", () => {
      const plugin = connector("notes", { plugin: { id: "notes" } } as Connector["transport"]);
      const coder: LoadedFile = {
        path: "agents/coder.yaml",
        kind: "agent",
        hub: null,
        value: { id: "coder", harness: "claude-code" } as Agent,
      };
      expect(deployReaches(workspace(plugin, coder))).toMatchObject({
        problems: [
          {
            reason:
              "The agent coder starts the program claude-code, and Cloudflare can't start programs.",
            cause: "this-computer",
          },
          {
            reason:
              "The connector notes works only on this computer, so it can't run on Cloudflare.",
            cause: "this-computer",
          },
        ],
      });
    });
  });
});

describe("hostOf", () => {
  it("reads the host without its port, lowercase", () => {
    expect(hostOf("https://API.Example.com:8443/v1")).toBe("api.example.com");
    expect(hostOf("http://[::1]:8080/")).toBe("[::1]");
  });

  it("gives nothing for an address with a password or no scheme", () => {
    expect(hostOf("https://me:pw@example.com/")).toBeUndefined();
    expect(hostOf("example.com")).toBeUndefined();
  });
});
