import type { IntegrationSheet } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { declaredToolsOf } from "./declared-tools.ts";
import type { HubDefinitions } from "./definitions.ts";
import type { LocalIntegrationInput } from "./trust-integrations.ts";

const emailNoun = { one: "email", many: "emails" };

/** A sheet with these tools, built as data so the test doesn't depend on the sheet's other fields. */
function integration(folder: string, tools: readonly unknown[]): LocalIntegrationInput {
  const sheet = { id: folder, version: "1.0.0", kit: 1, provides: ["connector"], tools };
  return {
    sheet: sheet as unknown as IntegrationSheet,
    settings: {},
    folder: `integrations/${folder}`,
    code: "sha256:00",
  };
}

/** A hub whose connectors have these transports, by id. */
function hubWith(transports: Record<string, unknown>): Pick<HubDefinitions, "connectors"> {
  const connectors = Object.entries(transports).map(([id, transport]) => [
    id,
    { id, transport, tools: { approve: [] } },
  ]);
  return { connectors: Object.fromEntries(connectors) } as unknown as Pick<
    HubDefinitions,
    "connectors"
  >;
}

const mailTools = [
  { name: "send_email", risk: "send", noun: emailNoun, untrusted: false },
  { name: "save_draft", risk: "write", noun: emailNoun, verb: "saved", untrusted: false },
  { name: "read_inbox", risk: "read", untrusted: true },
];

verifies("workspace.declared-tools", () => {
  it("gives a connector the tools of the sheet its integration folder holds", () => {
    const hub = hubWith({ mail: { integration: { folder: "mail" } } });
    expect(declaredToolsOf(hub, [integration("mail", mailTools)])).toEqual({
      mail: {
        send_email: { risk: "send", noun: emailNoun },
        save_draft: { risk: "write", noun: emailNoun, verb: "saved" },
        read_inbox: { risk: "read" },
      },
    });
  });

  it("gives no entry to a connector with another transport", () => {
    const hub = hubWith({ web: { http: { url: "https://example.com/mcp" } } });
    expect(declaredToolsOf(hub, [integration("mail", mailTools)])).toEqual({});
  });

  it("gives no entry to a connector whose folder holds no integration", () => {
    const hub = hubWith({ notes: { integration: { folder: "notes" } } });
    expect(declaredToolsOf(hub, [integration("mail", mailTools)])).toEqual({});
  });

  it("gives nothing when no integration is passed", () => {
    const hub = hubWith({ mail: { integration: { folder: "mail" } } });
    expect(declaredToolsOf(hub, [])).toEqual({});
  });
});
