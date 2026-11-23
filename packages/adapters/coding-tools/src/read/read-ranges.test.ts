import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { maxAnswerCharacters } from "../answer-cap.ts";
import {
  numberedLines,
  removeTestFolders,
  type TestFolders,
  testFolders,
} from "../folders.test-helper.ts";
import { ToolRefusal } from "../tool-input.ts";
import { readRangesTool } from "./read-ranges.ts";

afterEach(removeTestFolders);

/** A `read_ranges` tool over fresh folders, and a way to call it. */
async function readTool() {
  const folders = await testFolders();
  const tool = readRangesTool(folders);
  const read = (args: Record<string, unknown>) => tool.run(args, new AbortController().signal);
  return { folders, read };
}

async function refusal(promise: Promise<string>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ToolRefusal) return error.message;
    throw error;
  }
  throw new Error("The call was answered.");
}

async function writeLines(folders: TestFolders, path: string, count: number) {
  await folders.write(path, `${numberedLines(count)}\n`);
}

verifies("coding-tools.read-ranges", () => {
  describe("reading", () => {
    it("gives numbered lines of several files in one call", async () => {
      const { folders, read } = await readTool();
      await writeLines(folders, "a.txt", 3);
      await writeLines(folders, "src/b.txt", 10);
      const answer = await read({
        files: [{ path: "a.txt" }, { path: "src/b.txt", start: 4, end: 5 }],
      });
      expect(answer).toBe(
        "=== a.txt (lines 1–3 of 3)\n1\tline 1\n2\tline 2\n3\tline 3\n" +
          "=== src/b.txt (lines 4–5 of 10)\n4\tline 4\n5\tline 5",
      );
    });

    it("gives 400 lines without an end, and says what to ask for next", async () => {
      const { folders, read } = await readTool();
      await writeLines(folders, "long.txt", 1_000);
      const answer = await read({ files: [{ path: "long.txt" }] });
      expect(answer).toContain("=== long.txt (lines 1–400 of 1000)");
      expect(answer).toContain("400\tline 400\n… 600 more lines; ask for 401–800 to read on.");
      expect(answer).not.toContain("401\t");
    });

    it("cuts a long line and reads Windows line breaks", async () => {
      const { folders, read } = await readTool();
      await folders.write("wide.txt", `${"x".repeat(600)}\r\nshort\r\n`);
      const answer = await read({ files: [{ path: "wide.txt" }] });
      expect(answer).toContain(`1\t${"x".repeat(500)} … [line cut]\n2\tshort`);
    });

    it("says how many lines an empty file or a range past the end has", async () => {
      const { folders, read } = await readTool();
      await folders.write("empty.txt", "");
      await writeLines(folders, "three.txt", 3);
      const answer = await read({
        files: [{ path: "empty.txt" }, { path: "three.txt", start: 9 }],
      });
      expect(answer).toBe(
        "=== empty.txt: the file has 0 lines.\n=== three.txt: the file has 3 lines.",
      );
    });

    it("refuses one file without stopping the others", async () => {
      const { folders, read } = await readTool();
      await writeLines(folders, "a.txt", 1);
      await folders.write("image.png", new Uint8Array([137, 80, 78, 71, 0, 1]));
      const answer = await read({
        files: [{ path: "../x" }, { path: "image.png" }, { path: "a.txt" }],
      });
      expect(answer).toContain("=== ../x: '../x' is outside the working folder");
      expect(answer).toContain("=== image.png: 'image.png' is a binary file.");
      expect(answer).toContain("=== a.txt (lines 1 of 1)\n1\tline 1");
    });

    it("refuses a file over 8 MB before reading it", async () => {
      const { folders, read } = await readTool();
      const file = await folders.write("big.log", "");
      await writeFile(file, Buffer.alloc(8 * 1024 * 1024 + 1, 0x61));
      expect(await read({ files: [{ path: "big.log" }] })).toContain(
        "more than the 8388608 this tool reads",
      );
    });

    it("reads a log in the test log folder", async () => {
      const { folders, read } = await readTool();
      const log = join(folders.testLogFolder, "run-1.log");
      await writeFile(log, "FAIL a.test.ts\n");
      expect(await read({ files: [{ path: log }] })).toContain("1\tFAIL a.test.ts");
    });
  });

  describe("the answer's size", () => {
    it("stops at a whole line and says what wasn't sent", async () => {
      const { folders, read } = await readTool();
      await folders.write(
        "wide.txt",
        `${Array.from({ length: 400 }, () => "y".repeat(200)).join("\n")}\n`,
      );
      await writeLines(folders, "next.txt", 2);
      const answer = await read({ files: [{ path: "wide.txt" }, { path: "next.txt" }] });
      expect(answer.length).toBeLessThanOrEqual(maxAnswerCharacters);
      expect(answer).toMatch(/'wide\.txt' lines \d+–400 and the 1 files after it weren't sent/);
      expect(answer).not.toContain("=== next.txt");
    });
  });

  describe("arguments", () => {
    it.each([
      ["no files", {}],
      ["21 files", { files: Array.from({ length: 21 }, () => ({ path: "a.txt" })) }],
      ["an end before the start", { files: [{ path: "a.txt", start: 5, end: 2 }] }],
      ["a line 0", { files: [{ path: "a.txt", start: 0 }] }],
      ["an unknown argument", { files: [{ path: "a.txt" }], limit: 5 }],
      ["an unknown file field", { files: [{ path: "a.txt", lines: "1-5" }] }],
    ])("refuses %s", async (_name, args) => {
      const { read } = await readTool();
      expect(await refusal(read(args))).not.toBe("");
    });
  });

  describe("the read cache", () => {
    it("sends only the lines not sent before, while the file is unchanged", async () => {
      const { folders, read } = await readTool();
      await writeLines(folders, "a.txt", 100);
      await read({ files: [{ path: "a.txt", start: 1, end: 50 }] });
      const again = await read({ files: [{ path: "a.txt", start: 40, end: 60 }] });
      expect(again).toContain("(lines 40–50 unchanged since your earlier read;");
      expect(again).toContain("51\tline 51");
      expect(again).not.toContain("40\tline 40");
    });

    it("sends a changed file in full", async () => {
      const { folders, read } = await readTool();
      await writeLines(folders, "a.txt", 100);
      await read({ files: [{ path: "a.txt", start: 1, end: 50 }] });
      await folders.write("a.txt", `changed\n${numberedLines(99)}\n`);
      const again = await read({ files: [{ path: "a.txt", start: 1, end: 3 }] });
      expect(again).toContain("1\tchanged");
      expect(again).not.toContain("unchanged");
    });

    it("sends everything with fresh", async () => {
      const { folders, read } = await readTool();
      await writeLines(folders, "a.txt", 10);
      await read({ files: [{ path: "a.txt" }] });
      const again = await read({ files: [{ path: "a.txt" }], fresh: true });
      expect(again).toContain("1\tline 1");
      expect(again).not.toContain("unchanged");
    });

    it("counts only the lines that fitted in the answer as sent", async () => {
      const { folders, read } = await readTool();
      await folders.write(
        "wide.txt",
        `${Array.from({ length: 400 }, () => "y".repeat(200)).join("\n")}\n`,
      );
      const first = await read({ files: [{ path: "wide.txt" }] });
      const lastSent = Number(/(\d+)\ty+\n…/.exec(first)?.[1]);
      const again = await read({
        files: [{ path: "wide.txt", start: lastSent, end: lastSent + 1 }],
      });
      expect(again).toContain(`(lines ${lastSent} unchanged`);
      expect(again).toContain(`${lastSent + 1}\t`);
    });
  });
});
