import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type ApprovalItem, inboxItems } from "../inbox-items.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { actionSummary, approvalTitle } from "./approval-text.ts";

function approvalFor(tool: string): ApprovalItem {
  const [item] = inboxItems([
    waitingRun("r1", { approvals: [pendingApproval("call-1", tool, "2026-11-08T10:42:00.000Z")] }),
  ]);
  if (item?.kind !== "approval") throw new Error("expected an approval item");
  return item;
}

verifies("inbox.approval-title", () => {
  it("names the agent, the tool and its connector", () => {
    const item = approvalFor("notes-mcp__create_note");
    expect(approvalTitle(item, "Sorter")).toBe("Sorter wants to use create_note (notes-mcp)");
    expect(actionSummary(item)).toBe("create_note · notes-mcp");
  });

  it("names one of Halonic's own tools alone", () => {
    const item = approvalFor("publish");
    expect(approvalTitle(item, "Sorter")).toBe("Sorter wants to use publish");
    expect(actionSummary(item)).toBe("publish");
  });

  it("marks hidden characters in the tool and connector names", () => {
    const rlo = String.fromCodePoint(0x202e);
    const item = approvalFor(`notes${rlo}mcp__create${String.fromCodePoint(0x200f)}note`);
    expect(approvalTitle(item, "Sorter")).toBe(
      "Sorter wants to use create⟦U+200F⟧note (notes⟦U+202E⟧mcp)",
    );
    expect(actionSummary(item)).toBe("create⟦U+200F⟧note · notes⟦U+202E⟧mcp");
  });

  it("uses the agent's id until its name is known", () => {
    const item = approvalFor("publish");
    expect(approvalTitle(item)).toBe(`${item.agent} wants to use publish`);
  });

  it("names the subagent that asked, then the agent it asked for", () => {
    const item = { ...approvalFor("notes-mcp__create_note"), subagent: "checker" };
    expect(approvalTitle(item, "Sorter", "Checker")).toBe(
      "Checker, for Sorter, wants to use create_note (notes-mcp)",
    );
    expect(approvalTitle(item, "Sorter")).toBe(
      "checker, for Sorter, wants to use create_note (notes-mcp)",
    );
  });

  it("marks hidden characters in a subagent's id when its file is gone", () => {
    const item = { ...approvalFor("publish"), subagent: `chec${String.fromCodePoint(0x202e)}ker` };
    expect(approvalTitle(item, "Sorter")).toBe("chec⟦U+202E⟧ker, for Sorter, wants to use publish");
  });
});
