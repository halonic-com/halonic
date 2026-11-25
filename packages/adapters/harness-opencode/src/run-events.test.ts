import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { HarnessEvent } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { modelTools, OpenCodeEventReader } from "./run-events.ts";

const token = "fixture-run-token-0123456789";

/** The text of a recorded file in `fixtures/`. */
function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

function newReader(): OpenCodeEventReader {
  return new OpenCodeEventReader({ agentId: "writer", bridgeToken: token });
}

/** Every event of the lines, then the final ones. */
function readAll(reader: OpenCodeEventReader, lines: string[]): HarnessEvent[] {
  const events = lines.flatMap((line) => reader.read(line));
  return [...events, ...reader.finish()];
}

function line(value: unknown): string {
  return JSON.stringify(value);
}

verifies("harness-opencode.run-events", () => {
  describe("OpenCodeEventReader", () => {
    it("reads a recorded 2.3.0 run into tool calls and the last step's answer", () => {
      const events = readAll(newReader(), fixture("opencode-2.3.0-ok.jsonl").split("\n"));
      expect(events).toEqual([
        {
          type: "tool.called",
          agent: "writer",
          tool: "read",
          args: { path: "/acme/work/notes.txt" },
        },
        {
          type: "tool.result",
          agent: "writer",
          tool: "read",
          result: "Read file /acme/work/notes.txt, lines 1-1\n1: hello from acme",
          outcome: "ok",
        },
        {
          type: "tool.called",
          agent: "writer",
          tool: "shell",
          args: { command: "exit 3", description: "Fails on purpose" },
        },
        {
          type: "tool.result",
          agent: "writer",
          tool: "shell",
          result: "(no output)",
          outcome: "ok",
        },
        { type: "agent.finished", agent: "writer", output: "The file says hello from acme." },
      ]);
    });

    it("ends a recorded 2.3.0 run that the bridge refused with OpenCode's reason", () => {
      const reader = newReader();
      const lines = fixture("opencode-2.3.0-fail.jsonl").split("\n");
      const readAllLines = () => {
        for (const each of lines) reader.read(each);
      };
      expect(readAllLines).toThrow(
        "OpenCode stopped with an error: The bridge refused the model acme-other.",
      );
    });

    it("reports a call that failed as an error, with OpenCode's message", () => {
      const reader = newReader();
      const events = reader.read(
        line({
          type: "tool_use",
          part: { tool: "read", state: { status: "error", input: {}, error: "path: Missing key" } },
        }),
      );
      expect(events.at(-1)).toMatchObject({ outcome: "error", result: "path: Missing key" });
    });

    it("leaves out calls to the bridge's tools, which the bridge records", () => {
      const reader = newReader();
      const call = {
        tool: "halonic_web_search",
        state: { status: "completed", input: {}, output: "x" },
      };
      expect(reader.read(line({ type: "tool_use", part: call }))).toEqual([]);
    });

    it("removes the bridge token from events and errors", () => {
      const reader = newReader();
      const call = {
        tool: "shell",
        state: { status: "completed", input: { command: "env" }, output: token },
      };
      expect(JSON.stringify(reader.read(line({ type: "tool_use", part: call })))).not.toContain(
        token,
      );
      expect(() =>
        reader.read(line({ type: "error", error: { message: `bad ${token}` } })),
      ).toThrow(/^OpenCode stopped with an error: bad (?!.*fixture-run-token)/);
    });

    it("refuses a line that isn't JSON without quoting it", () => {
      expect(() => newReader().read(`not json ${token}`)).toThrow(
        "OpenCode printed a line that isn't JSON, so Halonic stopped the run.",
      );
    });

    it("skips blank lines and line types it doesn't know", () => {
      const reader = newReader();
      expect(reader.read("  ")).toEqual([]);
      expect(reader.read(line({ type: "background_wait", part: {} }))).toEqual([]);
    });

    it("refuses to finish a run in which no step finished", () => {
      expect(() => newReader().finish()).toThrow("OpenCode exited before the model answered.");
    });

    it("finishes once, and reads nothing after", () => {
      const reader = newReader();
      reader.read(line({ type: "step_finish", part: { reason: "stop" } }));
      expect(reader.finish()).toHaveLength(1);
      expect(reader.finished).toBe(true);
      expect(reader.finish()).toEqual([]);
      expect(reader.read(line({ type: "error", error: { message: "late" } }))).toEqual([]);
    });
  });
});

verifies("harness-opencode.tool-list", () => {
  it("expects exactly the tools recorded from OpenCode 2.3.0", () => {
    expect(JSON.parse(fixture("opencode-2.3.0-tools.json"))).toEqual(modelTools);
  });
});
