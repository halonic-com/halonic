import type { Agent, Connector, IntegrationSheet, Provider } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type TrustContent, trustContent } from "./trust-content.ts";
import { reachesOnlyTheTestModel, type TrustSkipInput } from "./trust-skip.ts";

function provider(id: string, type: string): Provider {
  return { version: 1, id, type, local: false, options: {} };
}

/** An agent as parsed from its file, with the defaults filled in. */
function agent(id: string, fields: Partial<Agent> = {}): Agent {
  return {
    version: 1,
    id,
    name: id,
    params: {},
    instructions: "",
    skills: [],
    knowledge: [],
    connectors: [],
    runLogs: false,
    collections: [],
    subagents: [],
    methods: {},
    output: { type: "text" },
    maxSteps: 6,
    ...fields,
  };
}

function connector(id: string, url: string): Connector {
  return {
    version: 1,
    id,
    transport: { http: { url, headers: {} } },
    tools: { approve: [] },
  };
}

/** A parsed permission sheet with these hosts. */
function sheet(id: string, hosts: readonly unknown[]): IntegrationSheet {
  // Built as data, so the test doesn't depend on which fields a
  // `{ fromSetting }` host has besides its setting.
  const data = { id, version: "1.0.0", kit: 1, provides: ["connector"], hosts, secrets: {} };
  return { ...data, tokens: [], tools: [], needs: [] } as unknown as IntegrationSheet;
}

/** The Acme example as it ships: the test model, and agents in Halonic's own loop. */
const acme: TrustSkipInput = {
  providers: [provider("mock", "mock")],
  connectors: [],
  agents: [agent("writer"), agent("classifier", { harness: "halonic" })],
};

/**
 * For each part of the trust content, the Acme example plus something that
 * fills that part. Typed by the parts, so a part trust covers later can't
 * be left out of this test.
 */
const withPart: Record<keyof TrustContent, TrustSkipInput> = {
  connectors: { ...acme, connectors: [connector("mail", "https://mcp.acme.test/v1/mcp")] },
  refused: { ...acme, connectors: [connector("mail", "https://ops:pw@mcp.acme.test/")] },
  agents: { ...acme, agents: [agent("coder", { harness: "claude-code" })] },
  integrations: {
    ...acme,
    integrations: [
      {
        sheet: sheet("home-station", [{ fromSetting: "url", class: "private" }]),
        settings: { url: "http://192.168.1.20:8123" },
        folder: "integrations/home-station",
        code: "sha256:00",
      },
    ],
  },
  providers: { ...acme, providers: [...acme.providers, provider("claude", "anthropic")] },
};

verifies("workspace.trust-skip", () => {
  describe("reachesOnlyTheTestModel", () => {
    it("holds for the Acme example: the test model, Halonic's own agents, no connector", () => {
      expect(reachesOnlyTheTestModel(acme)).toBe(true);
    });

    it("holds for a workspace with nothing in it", () => {
      expect(reachesOnlyTheTestModel({ providers: [], connectors: [] })).toBe(true);
    });

    it.each(["anthropic", "openai-compatible", "ollama"])("is off with a %s provider", (type) => {
      const input = { ...acme, providers: [...acme.providers, provider("other", type)] };
      expect(reachesOnlyTheTestModel(input)).toBe(false);
    });

    it("is off with a local integration, even one whose hosts are all fixed", () => {
      const weather = {
        sheet: sheet("weather", ["api.example.com"]),
        settings: {},
        folder: "integrations/weather",
        code: "sha256:00",
      };
      const input = { ...acme, integrations: [weather] };
      expect(trustContent(input).integrations).toHaveLength(1);
      expect(reachesOnlyTheTestModel(input)).toBe(false);
    });

    it.each(Object.entries(withPart))("is off when the trust content has %s", (part, input) => {
      // The input really fills that part, so the case tests what it says.
      expect(trustContent(input)[part as keyof TrustContent]).not.toHaveLength(0);
      expect(reachesOnlyTheTestModel(input)).toBe(false);
    });
  });
});
