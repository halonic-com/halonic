import { verifies } from "@halonicjs/testing-spec";
import type { ConnectorTrustContent } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { printable } from "./printable.ts";
import { type FingerprintedCheck, trustCheckLines } from "./trust-check.ts";

const files = (settings: Record<string, unknown>): ConnectorTrustContent => ({
  id: "files-mcp",
  transport: "stdio",
  settings: { command: "node", args: ["files.js"], cwd: ".", env: {}, secretEnv: {}, ...settings },
  tools: { approve: [] },
});

const programLines = (connector: ConnectorTrustContent) => {
  const check: FingerprintedCheck = {
    status: "new",
    content: { connectors: [connector], agents: [] },
    fingerprint: "hfp1:00",
    unpinned: [],
  };
  const shown = trustCheckLines(check, { name: "Acme", folder: "./acme" }).map(plainText);
  const start = shown.indexOf("Programs");
  return shown.slice(start + 1, shown.indexOf("", start));
};

verifies("cli.trust-check-working-folder", () => {
  it("shows the folder a program starts in, after its path and before its env entries", () => {
    expect(
      programLines(
        files({ path: "/usr/local/bin/node", cwd: "tools", env: { LOG_LEVEL: "debug" } }),
      ),
    ).toEqual([
      "  files-mcp     node files.js",
      "                Resolved path    /usr/local/bin/node",
      "                Working folder   tools",
      "                Environment      LOG_LEVEL=debug",
    ]);
  });

  it("shows no working folder for a program in the workspace's own folder", () => {
    expect(programLines(files({}))).toEqual(["  files-mcp     node files.js"]);
  });

  it("escapes the folder's unsafe characters", () => {
    const shown = programLines(files({ cwd: "tools\u202e/x" })).join("\n");

    expect(shown).toContain(printable("tools\u202e/x"));
    expect(shown).not.toContain("\u202e");
  });
});
