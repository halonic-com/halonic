import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { historyArgs, versionsFromLog } from "./history-log.ts";

const keepAll = () => true;
const id = (n: number) => String(n).padStart(40, "0");

verifies("source-control.history", () => {
  describe("versionsFromLog", () => {
    it("reads a version's name, notes, author, time and files", () => {
      const output = [
        `\u0001${id(1)}\u001fSam Lee\u001f1794793355\u001fSorter replies in Dutch\n\nOnly for tickets in NL.\n\u001f\0\n`,
        "agents/sorter.agent.yaml\0skills/tone/SKILL.md\0",
      ].join("");
      expect(versionsFromLog(output, keepAll)).toEqual([
        {
          id: id(1),
          name: "Sorter replies in Dutch",
          notes: "Only for tickets in NL.",
          author: "Sam Lee",
          at: 1794793355000,
          files: ["agents/sorter.agent.yaml", "skills/tone/SKILL.md"],
        },
      ]);
    });

    it("keeps the order of git and reads a version with no files", () => {
      const output = [
        `\u0001${id(2)}\u001fA\u001f2\u001fSecond\n\u001f\0\n`,
        `\u0001${id(1)}\u001fA\u001f1\u001fFirst\n\u001f\0\ny.md\0`,
      ].join("");
      const versions = versionsFromLog(output, keepAll);
      expect(versions.map((v) => [v.id, v.files])).toEqual([
        [id(2), []],
        [id(1), ["y.md"]],
      ]);
    });

    it("leaves out files the filter refuses", () => {
      const output = `\u0001${id(3)}\u001fA\u001f1\u001fX\n\u001f\0\n.halonic/review/p1.json\0hub.yaml\0`;
      expect(versionsFromLog(output, (path) => !path.startsWith(".halonic/"))[0]?.files).toEqual([
        "hub.yaml",
      ]);
    });

    it("keeps a message holding U+0001 and U+001F as one version", () => {
      const output = `\u0001${id(1)}\u001fA\u001f5\u001fbad\u0001byte\u001f\nnotes\n\u001f\0\nx.md\0`;
      expect(versionsFromLog(output, keepAll)).toEqual([
        {
          id: id(1),
          name: "bad\u0001byte\u001f",
          notes: "notes",
          author: "A",
          at: 5000,
          files: ["x.md"],
        },
      ]);
    });

    it("skips a record whose id is not a commit id or whose time is not a number", () => {
      const output = `\u0001zz\u001fA\u001f1\u001fX\n\u001f\0\n\u0001${id(1)}\u001fA\u001fsoon\u001fY\n\u001f\0\n`;
      expect(versionsFromLog(output, keepAll)).toEqual([]);
    });

    it("reads nothing from empty output", () => {
      expect(versionsFromLog("", keepAll)).toEqual([]);
    });
  });

  describe("historyArgs", () => {
    it("asks for as many versions as given, under the workspace folder", () => {
      expect(historyArgs(21)).toContain("--max-count=21");
      expect(historyArgs(21).slice(-2)).toEqual(["--", "."]);
    });
  });
});
