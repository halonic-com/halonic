import type { Agent, Connector, IntegrationSheet, Provider } from "@halonicjs/format";
import type { Clock, Digest } from "@halonicjs/ports";
import type { LocalIntegrationInput } from "@halonicjs/workspace";
import { TrustService, type TrustSubject } from "../trust-service.ts";
import { TestTrustStore } from "./test-trust-store.ts";

// Workspaces, connectors and a service for the trust service's tests.

export const location = "/workspaces/acme";
export const commandPaths = new Map([["node", "/usr/bin/node"]]);

/** A connector started as `node <id>.js`, with `env`. */
export function program(id: string, env: Record<string, string> = {}): Connector {
  return {
    version: 1,
    id,
    transport: { stdio: { command: "node", args: [`${id}.js`], env } },
    tools: { approve: [] },
  };
}

/** A connector reached over HTTP at `url`. */
export function remote(id: string, url: string): Connector {
  return { version: 1, id, transport: { http: { url, headers: {} } }, tools: { approve: [] } };
}

/** The acme workspace with `connectors` and nothing else. */
export function subject(...connectors: Connector[]): TrustSubject {
  return { location, connectors, commandPaths, agents: [], integrations: [], providers: [] };
}

/** A local integration that reads its address from the workspace setting `url`. */
export function homeStation(url: string): LocalIntegrationInput {
  // Built as data, so the test doesn't depend on the sheet's other fields.
  const sheet = {
    id: "home-station",
    version: "1.0.0",
    kit: 1,
    provides: ["connector"],
    hosts: [{ fromSetting: "url", class: "private" }],
    secrets: {},
    tokens: [],
    tools: [],
    needs: [],
  } as unknown as IntegrationSheet;
  return { sheet, settings: { url }, folder: "integrations/home-station", code: "sha256:00" };
}

/** A model provider as parsed from its file, with the defaults filled in. */
export function provider(fields: Partial<Provider> = {}): Provider {
  return {
    version: 1,
    id: "claude",
    type: "anthropic",
    secret: "anthropic-key",
    local: false,
    options: {},
    ...fields,
  };
}

/** An agent that runs in Claude Code and may reach the given sites. */
export function harnessAgent(allowedSites: string[]): Agent {
  return {
    version: 1,
    id: "coder",
    name: "Coder",
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
    harness: "claude-code",
    allowedSites,
  };
}

/**
 * A trust service over an in-memory store, and a way to move its clock to `iso`.
 *
 * @param digest - hashes the content; core has none of its own, so the test passes one in
 */
export function setUpTrustService(digest: Digest) {
  const store = new TestTrustStore();
  let now = "2026-11-09T10:00:00.000Z";
  const clock: Clock = { now: () => new Date(now) };
  const service = new TrustService({ store, digest, clock, appVersion: "0.1.0" });
  const later = (iso: string) => {
    now = iso;
  };
  return { store, service, later };
}

/** A registry pin for the npm package `name`. */
export function pin(name: string) {
  return {
    registry: "npm" as const,
    registryUrl: "https://registry.npmjs.org",
    package: name,
    version: "1.0.0",
  };
}
