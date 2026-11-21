import {
  type DiskLine,
  type DoctorReport,
  doctorSummary,
  type ModelsLine,
  type SandboxLine,
} from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { type DoctorFacts, doctorReportLines } from "./doctor-report.ts";

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
  freeBytes: 48 * 1024 ** 3,
  data: null,
  problem: null,
};

function printed(models: ModelsLine): string[] {
  const report = { models, sandbox: sandboxReady, disk: diskFree };
  const full: DoctorReport = {
    ...report,
    summary: doctorSummary([models, sandboxReady, diskFree]),
  };
  return doctorReportLines(full, facts).map(plainText);
}

verifies("cli.doctor-report", () => {
  it("says a key couldn't be read in the Secrets line's words, with no command that sets it", () => {
    const lines = printed({
      check: "models",
      status: "warning",
      ready: [],
      problems: [
        {
          problem: "key-unreadable",
          provider: "anthropic",
          name: "Anthropic",
          secret: "anthropic-key",
        },
      ],
    });

    expect(lines).toContain(
      "! Models      couldn't read anthropic-key from the secret store (provider anthropic)",
    );
    expect(lines.join("\n")).not.toContain("halonic secret set");
    expect(lines.at(-1)).toBe("No problems. 1 warning.");
  });
});
