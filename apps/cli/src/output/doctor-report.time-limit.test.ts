import {
  type DiskLine,
  type DoctorReport,
  doctorSummary,
  type WorkspaceLine,
} from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { type DoctorFacts, doctorReportLines } from "./doctor-report.ts";

const gb = 1024 ** 3;
const facts: DoctorFacts = {
  version: "0.1.0",
  system: "Linux x64",
  sandboxKind: "bubblewrap",
  signInShell: "sh",
};
const trusted: WorkspaceLine = { check: "workspace", status: "ok", name: "acme", trust: "trusted" };
const diskFree: DiskLine = {
  check: "disk",
  status: "ok",
  freeBytes: 48 * gb,
  data: { bytes: 1.4 * gb, runLogBytes: 1.1 * gb, complete: true },
  problem: null,
};

function printed(report: Omit<DoctorReport, "summary">): string[] {
  const { workspace, sandbox, harnesses, disk } = report;
  const all = [workspace, sandbox, harnesses, disk].filter((line) => line !== undefined);
  const full: DoctorReport = { ...report, summary: doctorSummary(all) };
  return doctorReportLines(full, facts).map(plainText);
}

verifies("cli.doctor-report", () => {
  describe("doctorReportLines for a check that ran out of time", () => {
    it("words a check that didn't answer in time on its own line, as a warning", () => {
      const lines = printed({
        workspace: trusted,
        sandbox: { check: "sandbox", status: "warning", timedOut: true },
        harnesses: { check: "harnesses", status: "warning", timedOut: true },
        disk: diskFree,
      });
      expect(lines).toEqual([
        "Halonic 0.1.0 · Linux x64",
        "",
        "✓ Workspace   acme · trusted on this computer",
        "! Sandbox     didn't answer in 5 seconds",
        "! Harnesses   didn't answer in 5 seconds",
        "✓ Disk        48 GB free · Halonic uses 1.4 GB (run logs 1.1 GB)",
        "",
        "No problems. 2 warnings.",
      ]);
    });
  });
});
