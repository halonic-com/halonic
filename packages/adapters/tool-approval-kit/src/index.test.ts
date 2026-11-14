import { toolApproval } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fileFormat, formatApproval, formatWaiting, readApproval, readWaiting } from "./index.ts";

verifies("fs-node.tool-approval-files", () => {
  describe("the text format", () => {
    it("reads back an approval it formatted, starting with the format and the key", () => {
      const approval = toolApproval();
      const text = formatApproval(approval);
      expect(text.startsWith(`{\n  "format": ${fileFormat},\n  "location"`)).toBe(true);
      expect(readApproval(approval, text)).toEqual({ kind: "read", value: approval });
    });

    it("reads back the waiting versions it formatted", () => {
      const key = { location: "/workspaces/acme", source: "notes" };
      const waiting = new Map([
        [
          "lookup",
          [{ fingerprint: toolApproval().fingerprint, firstSeenAt: "2026-11-01T00:00:00.000Z" }],
        ],
      ]);
      expect(readWaiting(key, formatWaiting(key, waiting))).toEqual({
        kind: "read",
        value: waiting,
      });
    });

    it("does not believe damaged text, or a file a newer Halonic wrote", () => {
      const approval = toolApproval();
      const text = formatApproval(approval);
      expect(readApproval(approval, text.slice(0, text.length / 2)).kind).toBe("damaged");
      const newer = text.replace(`"format": ${fileFormat}`, `"format": ${fileFormat + 1}`);
      expect(readApproval(approval, newer).kind).toBe("newer");
      expect(readApproval({ ...approval, name: "search" }, text).kind).toBe("damaged");
    });
  });
});
