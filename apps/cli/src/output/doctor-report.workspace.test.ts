// The notes under the Workspace line of `halonic doctor`, apart from its
// trust: the Windows drive under WSL and Studio's folder watch limit.

import {
  type DiskLine,
  type DoctorReport,
  doctorSummary,
  type SandboxLine,
  type WorkspaceLine,
} from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
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
const sandboxReady: SandboxLine = {
  check: "sandbox",
  status: "ok",
  capabilities: { files: "shared", strength: "os" },
};
const diskFree: DiskLine = {
  check: "disk",
  status: "ok",
  freeBytes: 48 * gb,
  data: { bytes: 1.4 * gb, runLogBytes: 1.1 * gb, complete: true },
  problem: null,
};

/** A report from its lines, with the summary `DoctorService` would add. */
function reportOf(lines: Omit<DoctorReport, "summary">): DoctorReport {
  const { workspace, sandbox, disk } = lines;
  const all = [workspace, sandbox, disk].filter((line) => line !== undefined);
  return { ...lines, summary: doctorSummary(all) };
}

function printed(report: DoctorReport): string[] {
  return doctorReportLines(report, facts).map(plainText);
}

/** The lines of the one check whose line starts with `label`, after its mark. */
function check(lines: readonly string[], label: string): string[] {
  const start = lines.findIndex((line) => line.slice(2).startsWith(label));
  const end = lines.findIndex((line, index) => index > start && !line.startsWith(" "));
  return lines.slice(start, end);
}

verifies("cli.doctor-windows-drive", () => {
  it("says under the trust which Windows drive the workspace is on, and how to fix it", () => {
    const workspace: WorkspaceLine = { ...trusted, status: "warning", windowsDrive: "/mnt/c" };
    const lines = printed(reportOf({ workspace, sandbox: sandboxReady, disk: diskFree }));

    expect(check(lines, "Workspace")).toEqual([
      "! Workspace   acme · trusted on this computer",
      "              The workspace is on the Windows drive /mnt/c, so runs are slower. If Studio on Windows opens this folder, keep it there.",
      "              Fix: if you use it only from the command line, move it into your Linux home folder (~), then run halonic doctor again.",
      "              More: https://docs.halonic.dev/security/sandbox/#wsl2-folder",
    ]);
    expect(lines.at(-1)).toBe("No problems. 1 warning.");
  });
});

verifies("cli.doctor-watch-limit", () => {
  it("says under the trust that Studio won't watch a workspace this big, and what to do", () => {
    const workspace: WorkspaceLine = { ...trusted, status: "warning", tooManyFilesToWatch: 50_000 };
    const lines = printed(reportOf({ workspace, sandbox: sandboxReady, disk: diskFree }));

    expect(check(lines, "Workspace")).toEqual([
      "! Workspace   acme · trusted on this computer",
      "              The workspace has more than 50,000 files, too many for Studio to watch for changes made outside Halonic.",
      "              Fix: to see them in Studio as they happen, open a smaller folder, or move files the workspace doesn't use out of this one.",
    ]);
    expect(lines.at(-1)).toBe("No problems. 1 warning.");
  });
});
