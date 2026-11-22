import {
  type DiskLine,
  type DoctorReport,
  doctorSummary,
  type HarnessesLine,
  type SandboxLine,
  type WorkspaceLine,
} from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { bold, phrase, renderPhrase } from "../messages/phrase.ts";
import { runFailedLines } from "../messages/run-failures.ts";
import { runsMessages } from "../messages/runs.ts";
import { type DoctorFacts, doctorReportLines } from "./doctor-report.ts";
import { paintFor } from "./paint.ts";

// Every line reaches the terminal through `renderPhrase`, so these draw each
// sentence as the printer does, with and without colour.

const pipe = paintFor({ colour: false, live: false, unicode: true });
const colour = paintFor({ colour: true, live: false, unicode: true });

const facts: DoctorFacts = {
  version: "0.1.0",
  system: "Linux x64",
  sandboxKind: "bubblewrap",
  signInShell: "sh",
};

const sandbox: SandboxLine = {
  check: "sandbox",
  status: "ok",
  capabilities: { files: "shared", strength: "os" },
};
const disk: DiskLine = {
  check: "disk",
  status: "ok",
  freeBytes: 48 * 1024 ** 3,
  data: { bytes: 1024 ** 3, runLogBytes: 1024 ** 3, complete: true },
  problem: null,
};

/** Doctor's lines with the given checks, as a pipe shows them. */
function doctorLines(lines: Pick<DoctorReport, "workspace" | "harnesses">): string[] {
  const checks = [lines.workspace, lines.harnesses, sandbox, disk].filter(
    (line) => line !== undefined,
  );
  const report: DoctorReport = { ...lines, sandbox, disk, summary: doctorSummary(checks) };
  return doctorReportLines(report, facts).map((line) => renderPhrase(line, pipe));
}

verifies("cli.outside-text-escaped", () => {
  it("shows the escapes in a workspace's name on doctor's Workspace line", () => {
    const workspace: WorkspaceLine = {
      check: "workspace",
      status: "ok",
      name: "\u001b[2Jacme",
      trust: "trusted",
    };
    const printed = doctorLines({ workspace }).join("\n");
    expect(printed).toContain("\\u001b[2Jacme");
    expect(printed).not.toContain("\u001b");
  });

  it("keeps a harness agent's name on one line on doctor's Harnesses line", () => {
    const harnesses: HarnessesLine = {
      check: "harnesses",
      status: "warning",
      installed: [],
      problems: [
        { problem: "missing", agent: "writer\n✓ Trusted", harness: "codex", name: "Codex" },
      ],
    };
    const printed = doctorLines({ harnesses }).join("\n");
    expect(printed).toContain("writer\\u000a✓ Trusted");
    expect(printed.split("\n").some((line) => line.startsWith("✓ Trusted"))).toBe(false);
  });

  it("shows the escapes in a workflow's name when runs send says the run goes on", () => {
    const sent = runsMessages.sent("approve", "01jd8q", "Support\u001b[1A reply");
    expect(renderPhrase(sent.phrase, pipe)).toBe(
      "Sent approve to run 01jd8q. Support\\u001b[1A reply goes on.",
    );
  });

  it("shows the escapes in an engine's message on a run's failure line", () => {
    const run = { title: "Support reply", step: "Draft a reply", runId: "01JD8Q" };
    const failure = { reason: "error", message: "Timed out\u001b[2K", causeKnown: true } as const;
    expect(renderPhrase(runFailedLines(run, failure).message.phrase, pipe)).toBe(
      "Support reply failed in the step Draft a reply. Timed out\\u001b[2K.",
    );
  });

  it("keeps Halonic's own styling and escapes only the text inside it", () => {
    const line = phrase`Trust ${bold("\u202eacme")}?`;
    expect(renderPhrase(line, colour)).toBe("Trust \u001b[1m\\u202eacme\u001b[22m?");
  });
});
