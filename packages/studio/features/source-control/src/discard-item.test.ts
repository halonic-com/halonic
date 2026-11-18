import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import type { ChangesList } from "./changes-list.ts";
import type { ChangedFile, DiscardOutcome } from "./changes-list-state.ts";
import { discardItem } from "./discard-item.ts";

const first = { path: "agents/a.agent.yaml" } as ChangedFile;
const second = { path: "agents/b.agent.yaml" } as ChangedFile;

function listGiving(...outcomes: DiscardOutcome[]): ChangesList {
  const discardFile = vi.fn();
  for (const outcome of outcomes) discardFile.mockResolvedValueOnce(outcome);
  return { discardFile } as unknown as ChangesList;
}

verifies("source-control.discard", () => {
  describe("discardItem", () => {
    it("puts back a file that went without a copy when a later file fails", async () => {
      const putBack = vi.fn(async () => undefined);
      const list = listGiving(
        { kind: "discarded", putBack },
        { kind: "failed", reason: "It changed while you were looking." },
      );
      const outcome = await discardItem(list, [first, second], { withoutCopy: true });
      expect(putBack).toHaveBeenCalledTimes(1);
      expect(outcome).toEqual({ kind: "failed", reason: "It changed while you were looking." });
    });

    it("names the files not put back when the roll-back fails too", async () => {
      const list = listGiving(
        { kind: "undone", undo: async () => "The file is locked." },
        { kind: "failed", reason: "It changed while you were looking." },
      );
      const outcome = await discardItem(list, [first, second]);
      expect(outcome).toEqual({
        kind: "partial",
        reason: "It changed while you were looking. The file is locked.",
        paths: [first.path],
      });
    });
  });
});
