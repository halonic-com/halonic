import { verifies } from "@halonicjs/testing-spec";
import type { ConnectorTrustContent } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { connectorTrustFields } from "./connector-trust-fields.ts";

const mail: ConnectorTrustContent = {
  id: "mail",
  transport: "http",
  settings: { url: "https://mail.example.com/mcp", headers: { "X-Team": "acme", Accept: "json" } },
  tools: { approve: ["send_mail"], allow: ["read_mail", "send_mail"] },
};

verifies("app.connector-trust-fields", () => {
  it("reads the tool lists and an HTTP connector's headers in name order", () => {
    expect(connectorTrustFields(mail)).toEqual({
      offeredTools: ["read_mail", "send_mail"],
      asksFirst: ["send_mail"],
      withoutAsking: [],
      headers: ["Accept: json", "X-Team: acme"],
      otherSettings: [],
    });
  });

  it("offers every tool when no list is given, and keeps approve: all", () => {
    const fields = connectorTrustFields({ ...mail, tools: { approve: "all" } });

    expect(fields.offeredTools).toBeUndefined();
    expect(fields.asksFirst).toBe("all");
  });

  it("reads the tools that run without asking", () => {
    const fields = connectorTrustFields({
      ...mail,
      tools: { approve: [], unknown: { read: ["read_mail", "list_mail"] } },
    });

    expect(fields.withoutAsking).toEqual(["list_mail", "read_mail"]);
    expect(fields.otherSettings).toEqual([]);
  });

  it("lists every field the schema doesn't know by its key path, the value as JSON", () => {
    const fields = connectorTrustFields({
      ...mail,
      settings: { ...mail.settings, unknown: { proxy: "http://127.0.0.1:8080" } },
      tools: { approve: [], unknown: { deny: ["delete_mail"] } },
      unknown: { retries: 3 },
    });

    expect(fields.otherSettings).toEqual([
      "retries: 3",
      'transport.http.proxy: "http://127.0.0.1:8080"',
      'tools.deny: ["delete_mail"]',
    ]);
  });

  it("gives no headers for a program", () => {
    const program: ConnectorTrustContent = {
      id: "files",
      transport: "stdio",
      settings: { command: "node", headers: { A: "b" } },
      tools: { approve: [] },
    };

    expect(connectorTrustFields(program).headers).toEqual([]);
  });

  it("leaves the text as written, for the screen to escape", () => {
    const fields = connectorTrustFields({
      ...mail,
      settings: { ...mail.settings, headers: { Note: "a\u001bb" } },
    });

    expect(fields.headers).toEqual(["Note: a\u001bb"]);
  });
});
