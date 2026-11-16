import {
  type DiskLine,
  type DoctorReport,
  doctorSummary,
  type ModelsLine,
  type SandboxLine,
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

function printed(report: Omit<DoctorReport, "summary">): string[] {
  const { models, sandbox, disk } = report;
  const all = [models, sandbox, disk].filter((line) => line !== undefined);
  const full: DoctorReport = { ...report, summary: doctorSummary(all) };
  return doctorReportLines(full, facts).map(plainText);
}

/** The lines of the one check whose line starts with `label`, after its mark. */
function check(lines: readonly string[], label: string): string[] {
  const start = lines.findIndex((line) => line.slice(2).startsWith(label));
  const end = lines.findIndex((line, index) => index > start && !line.startsWith(" "));
  return lines.slice(start, end);
}

verifies("cli.doctor-report", () => {
  describe("doctorReportLines", () => {
    it("escapes the control characters in model, provider and address text", () => {
      const models: ModelsLine = {
        check: "models",
        status: "failed",
        ready: [
          {
            provider: "ollama",
            name: "Ol\u001b[2Klama",
            answering: true,
            address: "localhost\u001b[1A:11434",
            models: [{ name: "llama\u001b[2K\u001b[1A", memoryBytes: 2 * gb }],
          },
          { provider: "anthropic", name: "Anth\u001b[2Kropic", keyStored: true },
        ],
        problems: [
          {
            problem: "unreachable",
            provider: "lmstudio",
            name: "LM\u001b[2K Studio",
            address: "localhost\u001b[1A:1234",
          },
          {
            problem: "no-key",
            alias: "sm\u001b[2Kart",
            provider: "openai",
            name: "Open\u001b[2KAI",
          },
        ],
      };
      const lines = printed({ models, sandbox: sandboxReady, disk: diskFree });
      expect(check(lines, "Models")).toEqual([
        "✕ Models      Ol\\u001b[2Klama answering at localhost\\u001b[1A:11434 · llama\\u001b[2K\\u001b[1A loaded (2.0 GB)",
        "              Anth\\u001b[2Kropic: API key stored",
        "              LM\\u001b[2K Studio isn't answering at localhost\\u001b[1A:1234",
        "              sm\\u001b[2Kart needs an API key for Open\\u001b[2KAI.",
      ]);
    });
  });
});
