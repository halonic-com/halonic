import type { Connector } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import type { LoadedWorkspace, LocalIntegrationInput } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { trustContentInputOf, trustSubjectOf } from "./trust-subject.ts";

/** A loaded workspace holding one file of each kind the trust check reads. */
const workspace = {
  files: [
    {
      kind: "connector",
      path: "connectors/mail.yaml",
      value: { id: "mail", transport: { stdio: { command: "npx", args: [] } } },
    },
    { kind: "agent", path: "agents/ada.yaml", value: { id: "ada" } },
    { kind: "provider", path: "providers/claude.yaml", value: { id: "claude" } },
    { kind: "workspace", path: "workspace.yaml", value: { name: "Acme" } },
  ],
} as unknown as LoadedWorkspace;
const integrations = [{ folder: "integrations/station" }] as unknown as LocalIntegrationInput[];

describe("trustSubjectOf", () => {
  it("collects the connectors, agents, providers and integrations, with the location and command paths", () => {
    const commandPaths = new Map([["npx", "/usr/bin/npx"]]);

    const subject = trustSubjectOf({
      workspace,
      integrations,
      location: "/work/acme",
      commandPaths,
    });

    expect(subject).toEqual({
      location: "/work/acme",
      ...trustContentInputOf(workspace, integrations),
      commandPaths,
    });
    expect(subject.connectors.map((connector) => connector.id)).toEqual(["mail"]);
    expect(subject.agents.map((agent) => agent.id)).toEqual(["ada"]);
    expect(subject.providers.map((provider) => provider.id)).toEqual(["claude"]);
    expect(subject.integrations).toEqual(integrations);
  });
});

verifies("app.integration-connector-settings", () => {
  const station = {
    folder: "integrations/station",
    settings: {},
  } as unknown as LocalIntegrationInput;
  const connector = (id: string, integration: Record<string, unknown>) => ({
    kind: "connector",
    path: `connectors/${id}.connector.yaml`,
    value: { id, transport: { integration: { folder: "station", ...integration } } } as Connector,
  });
  const withConnectors = (...files: ReturnType<typeof connector>[]) =>
    ({ files }) as unknown as LoadedWorkspace;

  it("gives an integration the settings of the connector file that names its folder", () => {
    const workspace = withConnectors(connector("station", { settings: { url: "http://a.test" } }));
    expect(trustContentInputOf(workspace, [station]).integrations).toEqual([
      { ...station, settings: { url: "http://a.test" } },
    ]);
  });

  it("keeps an integration without settings when no connector file names its folder", () => {
    const other = connector("other", { folder: "other", settings: { url: "http://a.test" } });
    expect(trustContentInputOf(withConnectors(other), [station]).integrations).toEqual([station]);
  });

  it("gives it the settings once when several files agree, and none when they differ", () => {
    const a = connector("a", { settings: { url: "http://a.test", limit: 2 } });
    const same = connector("same", { settings: { limit: 2, url: "http://a.test" } });
    const other = connector("other", { settings: { url: "http://b.test" } });
    expect(trustContentInputOf(withConnectors(a, same), [station]).integrations).toEqual([
      { ...station, settings: { url: "http://a.test", limit: 2 } },
    ]);
    expect(trustContentInputOf(withConnectors(a, other), [station]).integrations).toEqual([
      station,
    ]);
  });
});
