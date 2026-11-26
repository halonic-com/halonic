import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type CommandIo, runCommand, USAGE } from "./commands.ts";

function io(log: string, printed: string[]): CommandIo {
  return {
    print: (text) => printed.push(text),
    readText: () => log,
    remember: async (port, folder) => `remembered ${folder} on ${port}`,
  };
}

const slow =
  "2026-11-26T11:00:10Z timings: a window's engine answered in 9500 ms, asked 1000 ms after the page loaded";

verifies("open-timings.summary", () => {
  describe("runCommand", () => {
    it("prints the summary and answers 1 when the open is over the budget", async () => {
      const printed: string[] = [];
      expect(await runCommand(["summary", "shell.log"], io(slow, printed))).toBe(1);
      expect(printed.join("")).toContain("| engine | 9500 |");
    });

    it("takes another budget", async () => {
      expect(await runCommand(["summary", "shell.log", "20000"], io(slow, []))).toBe(0);
    });

    it("remembers a folder through the page", async () => {
      const printed: string[] = [];
      expect(await runCommand(["remember", "9333", "acme-folder"], io("", printed))).toBe(0);
      expect(printed).toEqual(["remembered acme-folder on 9333"]);
    });

    it("prints the usage for anything else", async () => {
      const printed: string[] = [];
      expect(await runCommand(["remember"], io("", printed))).toBe(2);
      expect(printed).toEqual([USAGE]);
    });
  });
});
