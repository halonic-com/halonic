import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { ParityCase } from "./cases.ts";
import {
  goldenText,
  lineVerdict,
  normalise,
  type OldCliRun,
  type OldResult,
  type OldTestRun,
  toCliRecording,
  toRecording,
  toRunLogs,
} from "./recording.ts";

function parityCase(id: string, line: number | null | undefined, files: string[] = []): ParityCase {
  return {
    id,
    folder: "unused",
    about: "a case",
    kind: "models",
    fault: line === undefined ? "valid" : "wrong-type",
    remove: [],
    expect: line === undefined ? null : { file: "library/m.yaml", path: "a", line },
    files,
  };
}

function result(diagnostics: OldResult["diagnostics"], files: OldResult["files"] = []): OldResult {
  return { id: "x", diagnostics, files, validate: { exitCode: 1, stdout: "", stderr: "" } };
}

const mapped = [
  { file: "library/m.yaml", flatPath: "m.yaml", read: true, schema: "models", issues: [] },
];

verifies("parity.recording-is-machine-free", () => {
  it("replaces every scratch folder with <workspace>", () => {
    expect(
      normalise("error /scratch/w1/m.yaml and /real/w1/m.yaml", ["/scratch/w1", "/real/w1"]),
    ).toBe("error <workspace>/m.yaml and <workspace>/m.yaml");
  });

  it("refuses output with a time or a run ID", () => {
    expect(() => normalise("started 2026-11-07T10:00:00Z", [])).toThrow(/carries a time or an ID/);
    expect(() => normalise("run test_mw6zmn5u_8202b972 waits", [])).toThrow(
      /carries a time or an ID/,
    );
    expect(normalise("OK: Acme, 1 hub(s)", [])).toBe("OK: Acme, 1 hub(s)");
  });

  it("writes two-space JSON with a final newline", () => {
    const recording = toRecording(parityCase("base", undefined), result([]), []);
    expect(goldenText(recording)).toBe(`${JSON.stringify(recording, null, 2)}\n`);
    expect(goldenText(recording).startsWith('{\n  "reference": "784f78d",\n  "case": "base"')).toBe(
      true,
    );
  });

  it("cleans messages and validate output in the recording", () => {
    const old: OldResult = {
      ...result([{ severity: "error", path: "m.yaml", message: "in /s/w/m.yaml" }]),
      validate: { exitCode: 1, stdout: "error /s/w/m.yaml\n", stderr: "/s/w" },
    };
    const recording = toRecording(parityCase("models/x", 2), old, ["/s/w"]);
    expect(recording.diagnostics[0]?.message).toBe("in <workspace>/m.yaml");
    expect(recording.validate).toEqual({
      exitCode: 1,
      stdout: "error <workspace>/m.yaml\n",
      stderr: "<workspace>",
    });
    expect(recording.valid).toBe(false);
  });
});

verifies("parity.line-verdict", () => {
  const error = (line?: number) => ({
    severity: "error" as const,
    path: "m.yaml",
    message: "bad",
    ...(line === undefined ? {} : { line }),
  });

  it("says same, different or no-line by the first error on the file", () => {
    expect(lineVerdict(parityCase("c", 7), result([error(7)], mapped))?.verdict).toBe("same");
    expect(lineVerdict(parityCase("c", 7), result([error(2), error(7)], mapped))).toEqual({
      expected: 7,
      recorded: 2,
      verdict: "different",
    });
    expect(lineVerdict(parityCase("c", 7), result([error()], mapped))?.verdict).toBe("no-line");
  });

  it("counts warnings but not info messages", () => {
    const warning = { ...error(4), severity: "warning" as const };
    const info = { ...error(7), severity: "info" as const };
    expect(lineVerdict(parityCase("c", 4), result([warning], mapped))?.verdict).toBe("same");
    expect(lineVerdict(parityCase("c", 7), result([info], mapped))?.verdict).toBe("no-error");
  });

  it("treats a null line as no line expected", () => {
    expect(lineVerdict(parityCase("c", null), result([error()], mapped))?.verdict).toBe("same");
    expect(lineVerdict(parityCase("c", null), result([error(1)], mapped))?.verdict).toBe(
      "different",
    );
  });

  it("matches by the path on disk when the old code knows the file", () => {
    const onDisk = { ...error(3), path: "library/m.yaml" };
    expect(lineVerdict(parityCase("c", 3), result([onDisk]))?.verdict).toBe("same");
    expect(lineVerdict(parityCase("c", 3), result([onDisk], mapped))?.verdict).toBe("no-error");
    expect(lineVerdict(parityCase("c", undefined), result([]))).toBeNull();
  });

  it("marks files pass, fail or not-read, and keeps only a case's own files", () => {
    const files: OldResult["files"] = [
      ...mapped,
      { file: "a.yaml", flatPath: "a.yaml", read: true, schema: "agent", issues: [] },
      { file: "b.yaml", flatPath: "b.yaml", read: false, schema: null, issues: [] },
      {
        file: "c.yaml",
        flatPath: "c.yaml",
        read: true,
        schema: "hub",
        issues: [{ path: ["x"], code: "c", message: "m" }],
      },
    ];
    const base = toRecording(parityCase("base", undefined), result([error(1)], files), []);
    expect(base.files.map((f) => f.status)).toEqual(["fail", "pass", "not-read", "fail"]);
    const own = toRecording(parityCase("agent/x", undefined, ["a.yaml"]), result([], files), []);
    expect(own.files.map((f) => f.file)).toEqual(["a.yaml"]);
    expect(own.valid).toBe(true);
  });
});

verifies("parity.runner-records-test-run-logs", () => {
  const test = (event: unknown): OldTestRun => ({
    hub: "acme",
    workflow: "greet",
    name: "plain",
    passed: true,
    failures: [],
    runId: "test_1",
    runs: [{ id: "test_1", summary: null, events: [event] }],
  });

  it("writes the run logs with the fixed clock, and the scratch folder replaced", () => {
    const event = { runId: "test_1", at: "2026-01-01T00:00:00.000Z", file: "/s/w/a.txt" };
    const runLogs = toRunLogs(parityCase("base", undefined), [test(event)], ["/s/w"]);
    expect(runLogs).toEqual({
      reference: "784f78d",
      case: "base",
      clock: "2026-01-01T00:00:00.000Z",
      tests: [test({ ...event, file: "<workspace>/a.txt" })],
    });
    expect(goldenText(runLogs)).toBe(`${JSON.stringify(runLogs, null, 2)}\n`);
  });

  it("refuses a run log with a random old run ID", () => {
    const event = { childRunId: "test_mw6zmn5u_8202b972" };
    expect(() => toRunLogs(parityCase("base", undefined), [test(event)], [])).toThrow(
      "A run log carries a random run ID; fix the IDs first",
    );
  });
});

verifies("parity.runner-records-cli-output", () => {
  const at = "2026-01-01T00:00:00.000Z";
  const made = (prefix: string, n: number): string =>
    `${prefix}_${Date.parse(at).toString(36)}_${n.toString(16).padStart(8, "0")}`;
  const call = (stdout: string, runs: OldCliRun["runs"]): OldCliRun => ({
    name: "run",
    args: ["run", "<workspace>"],
    exitCode: 0,
    stdout,
    stderr: "",
    runs,
    stored: runs.map((run) => `runs/${run.id}.jsonl`),
  });

  it("renames the IDs per call and prefix, in the order the counter made them", () => {
    // The counter skipped 2 (another random value); the child run was made after its parent.
    const [parent, child, test] = [made("run", 1), made("run", 12), made("test", 3)];
    const first = call(`Run ${parent}: child ${child}, test ${test}\n`, [
      { id: child, events: [{ runId: child, at, parent }] },
      { id: parent, events: [{ runId: parent, at }] },
      { id: test, events: [] },
    ]);
    const second = call(`Run ${child}\n`, [{ id: child, events: [] }]);
    const cli = toCliRecording(parityCase("base", undefined), [first, second]);
    expect(cli).toEqual({
      reference: "784f78d",
      case: "base",
      clock: at,
      calls: [
        {
          ...call("Run run_1: child run_2, test test_1\n", [
            { id: "run_1", events: [{ runId: "run_1", at }] },
            { id: "run_2", events: [{ runId: "run_2", at, parent: "run_1" }] },
            { id: "test_1", events: [] },
          ]),
          stored: ["runs/run_2.jsonl", "runs/run_1.jsonl", "runs/test_1.jsonl"],
        },
        call("Run run_1\n", [{ id: "run_1", events: [] }]),
      ],
    });
    expect(goldenText(cli)).toBe(`${JSON.stringify(cli, null, 2)}\n`);
  });

  it("keeps a timer's time a few days on from the fixed clock", () => {
    const event = { at: "2026-01-03T00:00:00.000Z" };
    const cli = toCliRecording(parityCase("base", undefined), [
      call("", [{ id: made("run", 1), events: [event] }]),
    ]);
    expect(cli.calls[0]?.runs[0]?.events).toEqual([event]);
  });

  it("refuses a random old run ID", () => {
    expect(() =>
      toCliRecording(parityCase("base", undefined), [call("Run run_mw6zmn5u_8202b972\n", [])]),
    ).toThrow("The old CLI's output carries a random run ID; fix the IDs first");
  });

  it("refuses a time from the real clock", () => {
    const event = { at: "2026-11-09T15:07:34.841Z" };
    expect(() =>
      toCliRecording(parityCase("base", undefined), [call("", [{ id: "x", events: [event] }])]),
    ).toThrow(
      "The old CLI's output carries 2026-11-09T15:07:34.841Z, not the fixed clock; fix the clock first",
    );
  });
});
