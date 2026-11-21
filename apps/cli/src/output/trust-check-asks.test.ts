import { verifies } from "@halonicjs/testing-spec";
import type { AgentTrustContent, TrustChanges } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { type FingerprintedCheck, trustCheckLines } from "./trust-check.ts";

const facts = { name: "Acme", folder: "./acme", sandboxWorks: true };
const fingerprint = "hfp1:c9b6e22b01f6cd3d69165343778b05c2f2c0c4e472d4d4eadeb6d073f5bc61ca";
const trustedAt = "2026-11-03T12:00:00.000Z";
const noChanges = { added: [], changed: [], removed: [], unchanged: 0 };

const coder: AgentTrustContent = { id: "coder", harness: "claude-code", allowedSites: [] };
const inSandbox: AgentTrustContent = { ...coder, asks: "in-sandbox" };

const lines = (check: FingerprintedCheck) => trustCheckLines(check, facts).map(plainText);

/** The Agents section of a check, from its heading to the blank line after it. */
function agentsSection(check: FingerprintedCheck): string[] {
  const all = lines(check);
  const start = all.indexOf("Agents");
  return all.slice(start, all.indexOf("", start));
}

/** A changed-workspace check where only `coder`'s `asks` differs. */
function asksChange(before: AgentTrustContent, after: AgentTrustContent): FingerprintedCheck {
  const changes: TrustChanges = {
    ...noChanges,
    agents: { ...noChanges, changed: [{ id: "coder", before, after, fields: ["asks"] }] },
    integrations: noChanges,
    providers: noChanges,
    onlyRemoves: false,
  };
  const content = { connectors: [], agents: [after] };
  return { status: "changed", content, fingerprint, unpinned: [], changes, trustedAt };
}

verifies("cli.trust-check-asks", () => {
  it("shows what an in-sandbox agent does without asking, under its row", () => {
    const check: FingerprintedCheck = {
      status: "new",
      content: { connectors: [], agents: [inSandbox] },
      fingerprint,
      unpinned: [],
    };
    expect(agentsSection(check)).toEqual([
      "Agents",
      "  Agents in this workspace that run in Claude Code or Codex.",
      "  coder         Claude Code",
      "                Without asking   will edit and run commands in its working folder, inside the sandbox; this version still asks first",
    ]);
  });

  it("shows no such line for an agent that always asks", () => {
    const check: FingerprintedCheck = {
      status: "new",
      content: { connectors: [], agents: [coder] },
      fingerprint,
      unpinned: [],
    };
    expect(agentsSection(check).slice(2)).toEqual(["  coder         Claude Code"]);
  });

  it("says so in a Changed row when an agent turns in-sandbox on, or off again", () => {
    expect(agentsSection(asksChange(coder, inSandbox)).slice(2)).toEqual([
      "  coder         will edit and run commands in its working folder without asking, inside the sandbox; this version still asks first   Changed",
    ]);
    expect(agentsSection(asksChange(inSandbox, coder)).slice(2)).toEqual([
      "  coder         asks again before it edits or runs a command   Changed",
    ]);
  });
});
