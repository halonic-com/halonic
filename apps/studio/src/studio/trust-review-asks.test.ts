import type { TrustCheck } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import type { AgentTrustContent, TrustChanges } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { trustReviewOf } from "./trust-review.ts";

const facts = { name: "Acme", folder: "/work/acme" };
const fingerprint = "hfp1:c9b6e22b01f6cd3d69165343778b05c2f2c0c4e472d4d4eadeb6d073f5bc61ca";
const noChanges = { added: [], changed: [], removed: [], unchanged: 0 };

const coder: AgentTrustContent = { id: "coder", harness: "claude-code", allowedSites: [] };
const inSandbox: AgentTrustContent = { ...coder, asks: "in-sandbox" };

/** The rows of the review's Agents section. */
function agentRows(check: TrustCheck) {
  const review = trustReviewOf(check, facts);
  return review?.sections.find((section) => section.heading.startsWith("Agents"))?.rows;
}

function newCheck(agent: AgentTrustContent): TrustCheck {
  return { status: "new", content: { connectors: [], agents: [agent] }, fingerprint, unpinned: [] };
}

function asksChange(before: AgentTrustContent, after: AgentTrustContent): TrustCheck {
  const changes: TrustChanges = {
    ...noChanges,
    agents: { ...noChanges, changed: [{ id: "coder", before, after, fields: ["asks"] }] },
    integrations: noChanges,
    providers: noChanges,
    onlyRemoves: false,
  };
  const content = { connectors: [], agents: [after] };
  const trustedAt = "2026-11-03T12:00:00.000Z";
  return { status: "changed", content, fingerprint, unpinned: [], changes, trustedAt };
}

verifies("studio.trust-review-asks", () => {
  it("shows what an in-sandbox agent does without asking, as a line of its row", () => {
    expect(agentRows(newCheck(inSandbox))).toEqual([
      {
        id: "coder",
        detail: "Claude Code",
        lines: [
          ["Without asking", "edits and runs commands in its working folder, inside the sandbox"],
        ],
      },
    ]);
  });

  it("shows no such line for an agent that always asks", () => {
    expect(agentRows(newCheck(coder))?.[0]?.lines).toEqual([]);
  });

  it("says so in its Changed row when an agent turns in-sandbox on, or off again", () => {
    expect(agentRows(asksChange(coder, inSandbox))?.[0]?.lines).toEqual([
      ["Now without asking", "edits and runs commands in its working folder, inside the sandbox"],
    ]);
    expect(agentRows(asksChange(inSandbox, coder))?.[0]?.lines).toEqual([
      ["Asks again", "before it edits or runs a command"],
    ]);
  });
});
