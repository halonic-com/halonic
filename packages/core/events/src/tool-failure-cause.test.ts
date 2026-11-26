import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ToolFailureCause, ToolNotMadeReason } from "./run-basics.ts";
import type { RunEventBody } from "./run-event.ts";
import {
  maxCauseHostLength,
  maxCauseNameLength,
  toolFailureCauseOf,
} from "./tool-failure-cause.ts";
import { parseEventLine } from "./upgrade.ts";

type ToolResultEvent = Extract<RunEventBody, { type: "tool.result" }>;

const line = {
  runId: "run-1",
  seq: 9,
  at: "2026-11-18T09:00:00.000Z",
  type: "tool.result",
  agent: "writer",
  tool: "search_pages",
  result: "The call broke off without an answer, so it may or may not have done its work.",
  outcome: "unknown",
};

/** The `tool.result` event a log line holds. */
function resultOf(text: string): ToolResultEvent {
  const event = parseEventLine(text);
  if (event.type !== "tool.result") throw new Error(`Not a tool result: ${text}`);
  return event;
}

/** The cause of a log line written with `cause`, as a screen reads it. */
function readLine(cause: unknown): ToolFailureCause | undefined {
  return toolFailureCauseOf(resultOf(JSON.stringify({ ...line, cause })));
}

verifies("events.tool-result-cause", () => {
  typeTest("has an optional cause on tool.result", () => {
    expectTypeOf<ToolResultEvent["cause"]>().toEqualTypeOf<ToolFailureCause | undefined>();
    expectTypeOf<ToolNotMadeReason>().toEqualTypeOf<
      "not-connected" | "tool-gone" | "sending-off" | "bad-arguments"
    >();
    expectTypeOf({
      type: "tool.result",
      agent: "writer",
      tool: "search_pages",
      result: "…",
      outcome: "unknown",
      cause: { code: "time-limit", seconds: 60 },
    } as const).toExtend<ToolResultEvent>();
  });

  describe("toolFailureCauseOf", () => {
    it("reads each cause as written", () => {
      const causes: ToolFailureCause[] = [
        { code: "time-limit", seconds: 60 },
        { code: "engine-stopped" },
        { code: "not-made", why: "sending-off" },
        { code: "connector-not-started", why: "other" },
        { code: "connector-not-started", why: "program-missing", name: "notion-mcp" },
        { code: "connector-not-started", why: "program-stopped", name: "sh" },
        { code: "connector-not-started", why: "plugin-not-trusted", name: "files" },
        { code: "connector-not-started", why: "plugin-changed", name: "files" },
        { code: "connector-not-started", why: "plugin-stopped", name: "Weather" },
        { code: "connector-not-started", why: "sandbox-not-ready" },
        { code: "connector-not-started", why: "unfenced-not-allowed", name: "container" },
        { code: "service-refused", why: "not-accepted" },
        { code: "service-refused", why: "not-allowed", sentOnce: true },
        { code: "service-refused", why: "slow-down", retries: 0 },
        { code: "service-refused", why: "slow-down", retries: 2, sentOnce: true },
        { code: "service-refused", why: "host-not-declared", host: "example.net" },
        { code: "service-refused", why: "host-not-declared", host: "xn--bcher-kva.example" },
        { code: "service-refused", why: "host-not-declared", host: "192.0.2.7" },
        { code: "service-refused", why: "host-not-declared", host: "[2001:db8::1]" },
      ];
      for (const cause of causes) {
        expect(readLine(cause)).toStrictEqual(cause);
      }
    });

    it("reads a code it doesn't know as absent", () => {
      expect(readLine({ code: "melted", seconds: 60 })).toBeUndefined();
    });

    it("reads a service-refused cause with a why it doesn't know as absent", () => {
      expect(readLine({ code: "service-refused", why: "melted" })).toBeUndefined();
      expect(readLine({ code: "service-refused", why: "time-limit", seconds: 60 })).toBeUndefined();
      expect(readLine({ code: "service-refused" })).toBeUndefined();
    });

    it("reads a service-refused cause whose fields don't fit as absent", () => {
      for (const retries of [-1, 3, 1.5, "1", undefined]) {
        expect(readLine({ code: "service-refused", why: "slow-down", retries })).toBeUndefined();
      }
      for (const host of ["", "Example.net", "example.net/path", "bücher.example", "a b", 7]) {
        expect(
          readLine({ code: "service-refused", why: "host-not-declared", host }),
        ).toBeUndefined();
      }
      const long = `${"a".repeat(maxCauseHostLength - 7)}.example`;
      expect(
        readLine({ code: "service-refused", why: "host-not-declared", host: long }),
      ).toBeUndefined();
    });

    it("keeps sentOnce only when it is true", () => {
      for (const sentOnce of [false, "true", 1]) {
        expect(readLine({ code: "service-refused", why: "not-accepted", sentOnce })).toStrictEqual({
          code: "service-refused",
          why: "not-accepted",
        });
      }
    });

    it("reads a field of the wrong type as absent", () => {
      expect(readLine({ code: "time-limit", seconds: "60" })).toBeUndefined();
      expect(readLine({ code: "time-limit", seconds: Number.NaN })).toBeUndefined();
      expect(readLine({ code: "not-made", why: "tired" })).toBeUndefined();
      expect(readLine({ code: "connector-not-started", why: "other", name: 7 })).toBeUndefined();
      expect(readLine("time-limit")).toBeUndefined();
      expect(readLine(null)).toBeUndefined();
    });

    it("reads a missing field as absent", () => {
      expect(readLine({ code: "time-limit" })).toBeUndefined();
      expect(readLine({ code: "not-made" })).toBeUndefined();
      expect(readLine({ code: "connector-not-started" })).toBeUndefined();
      expect(readLine({ seconds: 60 })).toBeUndefined();
    });

    it("reads a name longer than the limit as absent", () => {
      const name = "n".repeat(maxCauseNameLength + 1);
      expect(readLine({ code: "connector-not-started", why: "other", name })).toBeUndefined();
    });

    it("copies only the cause's own fields", () => {
      const cause = {
        code: "connector-not-started",
        why: "secret-not-set",
        name: "NOTION",
        extra: 1,
      };
      expect(readLine(cause)).toStrictEqual({
        code: "connector-not-started",
        why: "secret-not-set",
        name: "NOTION",
      });
      const refused = { code: "service-refused", why: "slow-down", retries: 1, status: 429 };
      expect(readLine(refused)).toStrictEqual({
        code: "service-refused",
        why: "slow-down",
        retries: 1,
      });
    });

    it("reads no cause on a tool result without one", () => {
      expect(toolFailureCauseOf(resultOf(JSON.stringify(line)))).toBeUndefined();
    });
  });

  it("reads no cause in the old run log", () => {
    const results = readFileSync(
      fileURLToPath(new URL("./fixtures/old-run-log.jsonl", import.meta.url)),
      "utf8",
    )
      .split("\n")
      .filter((text) => text.includes('"tool.result"'))
      .map(resultOf);
    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result).not.toHaveProperty("cause");
      expect(toolFailureCauseOf(result)).toBeUndefined();
    }
  });
});
