import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { ParityCase } from "./cases.ts";
import { goldenText, lineVerdict, normalise, type OldResult, toRecording } from "./recording.ts";

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
