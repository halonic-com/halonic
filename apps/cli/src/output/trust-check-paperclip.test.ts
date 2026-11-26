import { verifies } from "@halonicjs/testing-spec";
import type { ConnectorTrustContent } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { addressRows } from "./trust-check-rows.ts";

/** A Paperclip connector over the connection `connection`. */
function tasks(connection: string): ConnectorTrustContent {
  return {
    id: "tasks",
    transport: "paperclip",
    settings: { connection },
    tools: { approve: [] },
  };
}

verifies("cli.trust-check", () => {
  it("names a paperclip connector's connection on its row, so a changed one shows", () => {
    expect(addressRows(tasks("acme-ops")).map(plainText)).toEqual([
      "  tasks         paperclip · acme-ops",
    ]);
    expect(addressRows(tasks("acme-support")).map(plainText)).toEqual([
      "  tasks         paperclip · acme-support",
    ]);
  });

  it("escapes the connection like every other name on a row", () => {
    expect(addressRows(tasks("acme\u001b[31m")).map(plainText).join("\n")).not.toContain("\u001b");
  });
});
