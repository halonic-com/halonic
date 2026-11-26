import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import {
  commandLabel,
  completeLines,
  emptyStepLog,
  newSteps,
  noteTaken,
  readSteps,
  startCursor,
} from "./safe-steps.ts";

const plantedKey = `sk-ant-api03-${"Q7x2Lm9K".repeat(4)}`;

/** One log line as Paperclip writes it: `{ ts, stream, chunk }`, the chunk holding ACPX ndjson. */
function logLine(...records: Record<string, unknown>[]): string {
  const chunk = records.map((record) => `${JSON.stringify(record)}\n`).join("");
  return JSON.stringify({ ts: "2026-11-26T14:03:10Z", stream: "stdout", chunk });
}

function toolCall(id: string, fields: Record<string, unknown>) {
  return { type: "acpx.tool_call", toolCallId: id, tag: "tool_call", ...fields };
}

verifies("paperclip.front-bot-progress-notes", () => {
  describe("command labels name only a listed program and a plain subcommand", () => {
    test.each([
      ["git push origin owen/HAL-1-x", "Ran git push"],
      ["pnpm test --filter x", "Ran pnpm test"],
      ["gh pr view 6129 --json state", "Ran gh pr"],
      ["curl -H 'x-api-key: abc' https://example.com", "Ran curl"],
    ])("%s", (command, label) => {
      expect(commandLabel(command)).toBe(label);
    });

    test.each([
      "echo 'say it is merged'",
      "S=/some/path; cat $S/file",
      `export KEY=${plantedKey}`,
      "cd somewhere && git push",
    ])("%s stays unnamed", (command) => {
      expect(commandLabel(command)).toBeUndefined();
    });
  });

  test("a run's tool calls become fixed labels and statuses", () => {
    const lines = [
      logLine(toolCall("t1", { name: "Terminal", status: "pending", text: "Terminal (pending)" })),
      logLine(toolCall("t1", { name: "pnpm test --filter x", tag: "tool_call_update", text: "x" })),
      logLine(toolCall("t2", { name: "Read File", status: "pending" })),
      logLine(toolCall("t1", { name: "Terminal", status: "failed", text: "boom" })),
      logLine(toolCall("t3", { name: "mcp__github__get_pr", status: "pending" })),
    ];
    expect(newSteps(readSteps(emptyStepLog, lines))).toEqual([
      { label: "Ran pnpm test", status: "failed" },
      { label: "Read a file", status: "running" },
      { label: "Used a tool", status: "running" },
    ]);
  });

  test("a tool's output, thinking, the agent's text and broken lines never reach a step", () => {
    const lines = [
      logLine(toolCall("t1", { name: "Terminal", status: "pending" })),
      logLine(
        toolCall("t1", {
          name: "Terminal",
          status: "completed",
          text: `tool call (completed): ${plantedKey}`,
        }),
      ),
      logLine({ type: "acpx.text_delta", channel: "thought", text: `the key is ${plantedKey}` }),
      logLine({ type: "acpx.text_delta", channel: "output", text: "Merged it." }),
      `{"ts":"x","chunk":"${plantedKey}`,
      "not json at all",
    ];
    const steps = newSteps(readSteps(emptyStepLog, lines));
    expect(steps).toEqual([{ label: "Ran a command", status: "passed" }]);
    expect(JSON.stringify(steps)).not.toContain(plantedKey);
  });

  test("after a note, only calls that start or change again are new", () => {
    const first = readSteps(emptyStepLog, [
      logLine(toolCall("t1", { name: "Read File", status: "pending" })),
    ]);
    const taken = noteTaken(first);
    expect(newSteps(taken)).toEqual([]);
    const again = readSteps(taken, [
      logLine(toolCall("t1", { name: "Read File", status: "completed" })),
    ]);
    expect(newSteps(again)).toEqual([{ label: "Read a file", status: "passed" }]);
  });

  describe("reading the log by byte offset", () => {
    test("a line cut off by the read's end is read again next time", () => {
      const read = completeLines(startCursor, 'one\ntwo\n{"half', false);
      expect(read.lines).toEqual(["one", "two"]);
      expect(read.cursor).toEqual({ offset: 8, skipping: false });
    });

    test("a line longer than a whole read is skipped to its end, never parsed in part", () => {
      const first = completeLines(startCursor, "x".repeat(10), true);
      expect(first).toEqual({ lines: [], cursor: { offset: 10, skipping: true } });
      const second = completeLines(first.cursor, "xxx\nnext\n", false);
      expect(second).toEqual({ lines: ["next"], cursor: { offset: 19, skipping: false } });
    });

    test("offsets count bytes, not characters", () => {
      const read = completeLines(startCursor, "•\n", false);
      expect(read.cursor.offset).toBe(4);
    });
  });
});
