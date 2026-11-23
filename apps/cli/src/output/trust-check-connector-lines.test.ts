import { verifies } from "@halonicjs/testing-spec";
import type { ConnectorTrustContent } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { printable } from "./printable.ts";
import { type FingerprintedCheck, trustCheckLines } from "./trust-check.ts";

const sectionLines = (connector: ConnectorTrustContent, heading: string) => {
  const check: FingerprintedCheck = {
    status: "new",
    content: { connectors: [connector], agents: [] },
    fingerprint: "hfp1:00",
    unpinned: [],
  };
  const shown = trustCheckLines(check, { name: "Acme", folder: "./acme" }).map(plainText);
  const start = shown.indexOf(heading);
  return shown.slice(start + 1, shown.indexOf("", start + 1));
};

const mail: ConnectorTrustContent = {
  id: "mail",
  transport: "http",
  settings: { url: "https://mail.example.com/mcp", headers: { "X-Team": "acme" } },
  tools: { allow: ["read_mail", "send_mail"], approve: ["send_mail"] },
};

verifies("cli.trust-check-connector-lines", () => {
  it("shows a connector's tool lists and headers under its address", () => {
    expect(sectionLines(mail, "Addresses")).toEqual([
      "  mail          https://mail.example.com/mcp",
      "                Offered tools   read_mail, send_mail",
      "                Asks first      send_mail",
      "                Headers         X-Team: acme",
    ]);
  });

  it("says every tool asks first for approve: all, and lists the tools that don't", () => {
    const lines = sectionLines(
      { ...mail, settings: { url: mail.settings["url"], headers: {} }, tools: { approve: "all" } },
      "Addresses",
    );

    expect(lines).toEqual([
      "  mail          https://mail.example.com/mcp",
      "                Asks first   every tool",
    ]);
    const reading = sectionLines(
      { ...mail, tools: { approve: [], unknown: { read: ["read_mail"] } } },
      "Addresses",
    );
    expect(reading).toContain("                Without asking   read_mail");
  });

  it("shows every field the schema doesn't know under a program, before its sites", () => {
    const program: ConnectorTrustContent = {
      id: "files",
      transport: "stdio",
      settings: {
        command: "node",
        args: ["files.js"],
        cwd: ".",
        env: {},
        secretEnv: {},
        unknown: { shell: true },
      },
      tools: { approve: [] },
      unknown: { retries: 3 },
    };

    expect(sectionLines(program, "Programs")).toEqual([
      "  files         node files.js",
      "                Other settings   retries: 3",
      "                                 transport.stdio.shell: true",
    ]);
  });

  it("escapes the unsafe characters of headers and tool names", () => {
    const shown = sectionLines(
      {
        ...mail,
        settings: { ...mail.settings, headers: { Note: "a\u001b[2Jb" } },
        tools: { approve: ["send\u202E_mail"] },
      },
      "Addresses",
    ).join("\n");

    expect(shown).toContain(printable("Note: a\u001b[2Jb"));
    expect(shown).toContain(printable("send\u202E_mail"));
    expect(shown).not.toContain("\u001b");
    expect(shown).not.toContain("\u202E");
  });
});
