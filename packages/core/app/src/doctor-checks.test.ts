import type { HarnessDetection } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type DetectedHarness, doctorSummary, harnessesLine } from "./doctor-checks.ts";

function claudeCode(detection: HarnessDetection): DetectedHarness {
  return { id: "claude-code", name: "Claude Code", detection };
}

function codex(detection: HarnessDetection): DetectedHarness {
  return { id: "codex", name: "Codex", detection };
}

const missing: HarnessDetection = { status: "missing" };
const tooOld: HarnessDetection = { status: "unsupported", version: "0.9.1", supported: ">=1.0.0" };

verifies("app.doctor-harnesses", () => {
  it("lists every ready harness when no agent uses one", () => {
    const line = harnessesLine(
      [
        claudeCode({ status: "ready", version: "2.1.0" }),
        codex({ status: "ready", version: "0.9.2" }),
      ],
      [],
    );

    expect(line).toEqual({
      check: "harnesses",
      status: "ok",
      installed: [
        { harness: "claude-code", name: "Claude Code", version: "2.1.0" },
        { harness: "codex", name: "Codex", version: "0.9.2" },
      ],
      problems: [],
    });
  });

  it("warns once for each agent whose harness isn't installed", () => {
    const line = harnessesLine(
      [claudeCode({ status: "ready", version: "2.1.0" }), codex(missing)],
      [
        { agent: "Writer", harness: "codex" },
        { agent: "Reviewer", harness: "claude-code" },
        { agent: "Checker", harness: "codex" },
      ],
    );

    expect(line?.status).toBe("warning");
    expect(line?.installed).toEqual([
      { harness: "claude-code", name: "Claude Code", version: "2.1.0" },
    ]);
    expect(line?.problems).toEqual([
      { problem: "missing", agent: "Writer", harness: "codex", name: "Codex" },
      { problem: "missing", agent: "Checker", harness: "codex", name: "Codex" },
    ]);
  });

  it("warns once for a used harness in a version Halonic doesn't support, however many agents use it", () => {
    const line = harnessesLine(
      [claudeCode(tooOld)],
      [
        { agent: "Writer", harness: "claude-code" },
        { agent: "Reviewer", harness: "claude-code" },
      ],
    );

    expect(line).toEqual({
      check: "harnesses",
      status: "warning",
      installed: [],
      problems: [
        {
          problem: "unsupported",
          harness: "claude-code",
          name: "Claude Code",
          version: "0.9.1",
          supported: ">=1.0.0",
        },
      ],
    });
  });

  it("warns with the reason when Halonic couldn't ask a used harness its version", () => {
    const error = "Claude Code didn't answer within 10 seconds.";
    const line = harnessesLine(
      [claudeCode({ status: "failed", error })],
      [{ agent: "Writer", harness: "claude-code" }],
    );

    expect(line?.status).toBe("warning");
    expect(line?.problems).toEqual([
      { problem: "failed", harness: "claude-code", name: "Claude Code", error },
    ]);
  });

  it("doesn't mark the line for a harness no agent uses", () => {
    const line = harnessesLine(
      [claudeCode(tooOld), codex({ status: "ready", version: "0.9.2" })],
      [{ agent: "Writer", harness: "codex" }],
    );

    expect(line?.status).toBe("ok");
    expect(line?.installed).toEqual([{ harness: "codex", name: "Codex", version: "0.9.2" }]);
    expect(line?.problems).toEqual([]);
  });

  it("never marks the line as failed, so it alone never makes doctor exit 1", () => {
    const line = harnessesLine(
      [claudeCode(tooOld), codex(missing)],
      [
        { agent: "Writer", harness: "codex" },
        { agent: "Reviewer", harness: "claude-code" },
      ],
    );

    expect(line?.status).toBe("warning");
    expect(doctorSummary(line ? [line] : []).needsFixing).toBe(false);
  });

  it("has no line when no harness is ready and no agent uses one", () => {
    expect(harnessesLine([claudeCode(missing), codex(tooOld)], [])).toBeUndefined();
    expect(harnessesLine([], [])).toBeUndefined();
  });

  describe("an agent naming a harness Halonic doesn't have", () => {
    it("is a bug, because the agent file's format allows only Halonic's harnesses", () => {
      expect(() =>
        harnessesLine([codex(missing)], [{ agent: "Writer", harness: "gemini" }]),
      ).toThrow("The agent Writer uses the harness gemini, which Halonic doesn't have.");
    });
  });
});

verifies("app.doctor-summary", () => {
  it("has nothing to fix when every line is ✓", () => {
    expect(doctorSummary([{ status: "ok" }, { status: "ok" }])).toEqual({
      problems: 0,
      warnings: 0,
      needsFixing: false,
    });
  });

  it("needs fixing when a line is ✕, and counts warnings apart", () => {
    expect(doctorSummary([{ status: "ok" }, { status: "failed" }, { status: "warning" }])).toEqual({
      problems: 1,
      warnings: 1,
      needsFixing: true,
    });
  });

  it("doesn't need fixing for warnings alone", () => {
    expect(doctorSummary([{ status: "warning" }, { status: "warning" }, { status: "ok" }])).toEqual(
      {
        problems: 0,
        warnings: 2,
        needsFixing: false,
      },
    );
  });
});
