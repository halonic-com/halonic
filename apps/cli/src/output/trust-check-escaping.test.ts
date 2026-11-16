import { verifies } from "@halonicjs/testing-spec";
import type { AgentTrustContent, ConnectorTrustContent, TrustChanges } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { printable } from "./printable.ts";
import { type FingerprintedCheck, trustCheckLines } from "./trust-check.ts";

const fingerprint = "hfp1:c9b6e22b01f6cd3d69165343778b05c2f2c0c4e472d4d4eadeb6d073f5bc61ca";
const trustedAt = "2026-11-03T12:00:00.000Z";

const program = (
  id: string,
  command: string,
  args: string[],
  secretEnv = {},
): ConnectorTrustContent => ({
  id,
  transport: "stdio",
  settings: { command, args, cwd: ".", env: {}, secretEnv },
  tools: { approve: [] },
});
const mail = program("mail-mcp", "npx", ["@acme/mail-mcp", "2.3.1"]);
const coder: AgentTrustContent = {
  id: "coder",
  harness: "claude-code",
  allowedSites: ["pypi.org"],
  workingFolder: "src/app",
};
const current = { fingerprint, unpinned: [] };
const content = { connectors: [mail], agents: [coder] };
const noChanges = { added: [], changed: [], removed: [], unchanged: 0 };

const lines = (check: FingerprintedCheck) =>
  trustCheckLines(check, { name: "Acme", folder: "./acme", sandboxWorks: true }).map(plainText);

const hostile = "a\u001b[2K\rb\u202ec";
const shownHostile = "a\\u001b[2K\\u000db\\u202ec";

const escapesWorkspaceText = () => {
  it("shows control and bidi characters in a program's arguments as \\u codes", () => {
    const sneaky = program("sneaky", "npx", [hostile, "x\u202ey", "p\rq"]);
    const shown = lines({ status: "new", content: { connectors: [sneaky] }, ...current });
    expect(shown).toContain(`  sneaky        npx ${shownHostile} x\\u202ey p\\u000dq`);
    expect(shown.map(printable)).toEqual(shown);
  });

  it("escapes the other text a workspace writes", () => {
    const sneaky = program("sn\u202eeaky", "n\u001bpx", [], { "K\u202eEY": "‹secret K\u202eEY›" });
    const shown = lines({ status: "new", content: { connectors: [sneaky] }, ...current });
    expect(shown.join("\n")).toContain("sn\\u202eeaky");
    expect(shown.join("\n")).toContain("n\\u001bpx");
    expect(shown.join("\n")).toContain("K\\u202eEY");
    expect(shown.map(printable)).toEqual(shown);
  });

  it("escapes a changed agent's id and sites in its Changed rows", () => {
    const id = "co\u202eder\u001b[2K";
    const changes: TrustChanges = {
      added: [],
      changed: [],
      removed: [],
      unchanged: 0,
      agents: {
        added: [],
        changed: [
          {
            id,
            before: { id, harness: "claude-code", allowedSites: [] },
            after: { ...coder, id, harness: "codex", allowedSites: ["a\u202eb.org"] },
            fields: ["allowedSites", "harness"],
          },
        ],
        removed: [],
        unchanged: 0,
      },
      integrations: noChanges,
      providers: noChanges,
      onlyRemoves: false,
    };
    const shown = lines({ status: "changed", content, ...current, changes, trustedAt });
    expect(shown.join("\n")).toContain("co\\u202eder\\u001b[2K");
    expect(shown.join("\n")).toContain("a\\u202eb.org");
    expect(shown.map(printable)).toEqual(shown);
  });

  it("escapes the workspace's name and folder in the heading", () => {
    const shown = trustCheckLines(
      { status: "new", content: { connectors: [mail] }, ...current },
      { name: "Ac\u001b[31mme\u202e", folder: "./a\rcme" },
    ).map(plainText);
    expect(shown[0]).toBe("Trust check for Ac\\u001b[31mme\\u202e (./a\\u000dcme)");
    expect(shown.map(printable)).toEqual(shown);
  });
};

verifies("cli.commands.validate.check-workspace", escapesWorkspaceText);
verifies("cli.commands.tools.blocks", escapesWorkspaceText);
