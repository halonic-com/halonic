import { verifies } from "@halonicjs/testing-spec";
import type { ConnectorTrustContent } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { trustReviewOf } from "./trust-review.ts";

const fingerprint = "hfp1:00";

const mail: ConnectorTrustContent = {
  id: "mail",
  transport: "http",
  settings: { url: "https://mail.example.com/mcp", headers: { "X-Team": "acme" } },
  tools: { allow: ["read_mail", "send_mail"], approve: ["send_mail"] },
};

const rowsOf = (connector: ConnectorTrustContent) =>
  trustReviewOf(
    { status: "new", content: { connectors: [connector] }, fingerprint, unpinned: [] },
    { name: "Acme", folder: "/work/acme" },
  )?.sections[0]?.rows;

verifies("studio.trust-review-connector-lines", () => {
  it("shows a connector's tool lists and headers under its address", () => {
    expect(rowsOf(mail)).toEqual([
      {
        id: "mail",
        detail: "https://mail.example.com/mcp",
        lines: [
          ["Offered tools", "read_mail, send_mail", "code"],
          ["Asks first", "send_mail", "code"],
          ["Headers", "X-Team: acme", "code"],
        ],
      },
    ]);
  });

  it("names a paperclip connector's connection after its transport", () => {
    const tasks: ConnectorTrustContent = {
      id: "tasks",
      transport: "paperclip",
      settings: { connection: "acme-ops" },
      tools: { approve: [] },
    };

    expect(rowsOf(tasks)).toEqual([{ id: "tasks", detail: "paperclip · acme-ops", lines: [] }]);
  });

  it("says every tool asks first for approve: all, and lists the tools that don't", () => {
    const every = rowsOf({ ...mail, tools: { approve: "all" } });
    const reading = rowsOf({ ...mail, tools: { approve: [], unknown: { read: ["read_mail"] } } });

    expect(every?.[0]?.lines).toContainEqual(["Asks first", "every tool"]);
    expect(reading?.[0]?.lines).toContainEqual(["Without asking", "read_mail", "code"]);
  });

  it("shows every field the schema doesn't know under a program", () => {
    const program: ConnectorTrustContent = {
      id: "files",
      transport: "stdio",
      settings: { command: "node", args: [], cwd: ".", env: {}, secretEnv: {}, unknown: { a: 1 } },
      tools: { approve: [] },
      unknown: { retries: 3 },
    };

    expect(rowsOf(program)?.[0]?.lines).toEqual([
      ["Other settings", "retries: 3", "code"],
      ["", "transport.stdio.a: 1", "code"],
    ]);
  });
});
