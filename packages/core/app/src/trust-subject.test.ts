import type { LoadedWorkspace, LocalIntegrationInput } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { trustContentInputOf, trustSubjectOf } from "./trust-subject.ts";

/** A loaded workspace holding one file of each kind the trust check reads. */
const workspace = {
  files: [
    { kind: "connector", path: "connectors/mail.yaml", value: { id: "mail" } },
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
    expect(subject.integrations).toBe(integrations);
  });
});
