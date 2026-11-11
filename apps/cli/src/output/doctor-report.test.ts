import {
  type DiskLine,
  type DoctorReport,
  doctorSummary,
  type HarnessesLine,
  type ModelsLine,
  type NodeLine,
  type SandboxLine,
  type WorkspaceLine,
} from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { plainText, renderPhrase } from "../messages/phrase.ts";
import { type DoctorFacts, doctorReportLines } from "./doctor-report.ts";
import { paintFor } from "./paint.ts";

const gb = 1024 ** 3;
const facts: DoctorFacts = { version: "0.1.0", system: "Linux x64", sandboxKind: "bubblewrap" };

const trusted: WorkspaceLine = { check: "workspace", status: "ok", name: "acme", trust: "trusted" };
const ollamaAndAnthropic: ModelsLine = {
  check: "models",
  status: "ok",
  ready: [
    {
      provider: "ollama",
      name: "Ollama",
      answering: true,
      address: "localhost:11434",
      models: [{ name: "llama3.2", memoryBytes: 2 * gb }],
    },
    { provider: "anthropic", name: "Anthropic", keyStored: true },
  ],
  problems: [],
};
const sandboxReady: SandboxLine = {
  check: "sandbox",
  status: "ok",
  capabilities: { files: "shared", strength: "os" },
};
const bubblewrapMissing: SandboxLine = {
  check: "sandbox",
  status: "failed",
  reason: "bubblewrap-missing",
  missing: ["bwrap not found"],
};
const data = { bytes: 1.4 * gb, runLogBytes: 1.1 * gb, complete: true };
const diskFree: DiskLine = {
  check: "disk",
  status: "ok",
  freeBytes: 48 * gb,
  data,
  problem: null,
};

/** A report from its lines, with the summary `DoctorService` would add. */
function reportOf(lines: Omit<DoctorReport, "summary">): DoctorReport {
  const { workspace, models, sandbox, harnesses, node, disk } = lines;
  const all = [workspace, models, sandbox, harnesses, node, disk].filter(
    (line) => line !== undefined,
  );
  return { ...lines, summary: doctorSummary(all) };
}

function printed(report: DoctorReport, given: DoctorFacts = facts): string[] {
  return doctorReportLines(report, given).map(plainText);
}

/** The lines of the one check whose line starts with `label`, after its mark. */
function check(lines: readonly string[], label: string): string[] {
  const start = lines.findIndex((line) => line.slice(2).startsWith(label));
  const end = lines.findIndex((line, index) => index > start && !line.startsWith(" "));
  return lines.slice(start, end);
}

verifies("cli.doctor-report", () => {
  it("prints cli-output 3.7's example line for line", () => {
    const report = reportOf({
      workspace: trusted,
      models: ollamaAndAnthropic,
      sandbox: bubblewrapMissing,
      disk: diskFree,
    });
    expect(printed(report)).toEqual([
      "Halonic 0.1.0 · Linux x64",
      "",
      "✓ Workspace   acme · trusted on this computer",
      "✓ Models      Ollama answering at localhost:11434 · llama3.2 loaded (2.0 GB)",
      "              Anthropic: API key stored",
      "✕ Sandbox     can't start on this computer",
      "              bubblewrap isn't installed, and the sandbox needs it.",
      "              Fix: install it, for example on Ubuntu or Debian with sudo apt install bubblewrap. Then run halonic doctor again.",
      "              More: https://docs.halonic.dev/sandbox#bubblewrap (bubblewrap-missing)",
      "✓ Disk        48 GB free · Halonic uses 1.4 GB (run logs 1.1 GB)",
      "",
      "1 problem. Agents set to run in a sandbox won't start until it's fixed.",
    ]);
  });

  it("names a provider's aliases without a key on one line", () => {
    const models: ModelsLine = {
      check: "models",
      status: "warning",
      ready: [],
      problems: [
        { problem: "no-key", alias: "smart", provider: "anthropic", name: "Anthropic" },
        { problem: "no-key", alias: "writer", provider: "anthropic", name: "Anthropic" },
      ],
    };
    const lines = printed(reportOf({ models, sandbox: sandboxReady, disk: diskFree }));
    expect(check(lines, "Models")).toEqual([
      "! Models      smart and writer need an API key for Anthropic.",
    ]);
    expect(lines.at(-1)).toBe("No problems. 1 warning.");
  });

  it("puts a server that doesn't answer first, and counts the line once", () => {
    const models: ModelsLine = {
      check: "models",
      status: "failed",
      ready: [],
      problems: [
        { problem: "unreachable", provider: "ollama", name: "Ollama", address: "localhost:11434" },
        { problem: "no-key", alias: "smart", provider: "anthropic", name: "Anthropic" },
      ],
    };
    const lines = printed(reportOf({ models, sandbox: sandboxReady, disk: diskFree }));
    expect(check(lines, "Models")).toEqual([
      "✕ Models      Ollama isn't answering at localhost:11434",
      "              smart needs an API key for Anthropic.",
    ]);
    expect(lines.at(-1)).toBe("1 problem. Agents that use Ollama won't run until it answers.");
  });

  it("lists the ready harnesses, then each problem with its fix", () => {
    const harnesses: HarnessesLine = {
      check: "harnesses",
      status: "warning",
      installed: [{ harness: "claude-code", name: "Claude Code", version: "2.1.0" }],
      problems: [{ problem: "missing", agent: "Writer", harness: "codex", name: "Codex" }],
    };
    const lines = printed(reportOf({ sandbox: sandboxReady, harnesses, disk: diskFree }));
    expect(check(lines, "Harnesses")).toEqual([
      "! Harnesses   Claude Code 2.1.0",
      "              Writer uses Codex, and it isn't installed.",
      "              Fix: install Codex, then run halonic doctor again.",
    ]);
  });

  it("keeps the Disk line when the free space can't be read, with no fix line", () => {
    const disk: DiskLine = {
      ...diskFree,
      status: "warning",
      freeBytes: null,
      problem: "unreadable",
    };
    expect(check(printed(reportOf({ sandbox: sandboxReady, disk })), "Disk")).toEqual([
      "! Disk        free space unknown · Halonic uses 1.4 GB (run logs 1.1 GB)",
      "              Halonic couldn't read the free space on this drive.",
    ]);
  });
});

verifies("cli.doctor-windows-drive", () => {
  it("says under the trust which Windows drive the workspace is on, and how to fix it", () => {
    const workspace: WorkspaceLine = { ...trusted, status: "warning", windowsDrive: "/mnt/c" };
    const lines = printed(reportOf({ workspace, sandbox: sandboxReady, disk: diskFree }));

    expect(check(lines, "Workspace")).toEqual([
      "! Workspace   acme · trusted on this computer",
      "              The workspace is on the Windows drive /mnt/c, so runs are slow and Halonic doesn't notice edits made in Windows.",
      "              Fix: move it into your Linux home folder (~), then run halonic doctor again.",
      "              More: https://docs.halonic.dev/sandbox#wsl2-folder",
    ]);
    expect(lines.at(-1)).toBe("No problems. 1 warning.");
  });
});

verifies("cli.doctor-node", () => {
  it("says Windows' Node.js runs in a WSL folder, with the fix, between Harnesses and Disk", () => {
    const node: NodeLine = { check: "node", status: "warning", problem: "windows-node-in-wsl" };
    const lines = printed(reportOf({ sandbox: sandboxReady, node, disk: diskFree }));

    expect(lines.slice(2, 6)).toEqual([
      "✓ Sandbox     ready · bubblewrap",
      "! Node.js     This is Windows' Node.js, running in a WSL folder.",
      "              Fix: install Node.js inside WSL, then run halonic doctor again from a WSL terminal.",
      "✓ Disk        48 GB free · Halonic uses 1.4 GB (run logs 1.1 GB)",
    ]);
    expect(lines.at(-1)).toBe("No problems. 1 warning.");
  });

  it("gives a Sandbox that can't start Windows' Node.js's code, not the sandbox's own", () => {
    const sandbox: SandboxLine = {
      check: "sandbox",
      status: "failed",
      reason: "windows",
      missing: [],
    };
    const node: NodeLine = { check: "node", status: "warning", problem: "windows-node-in-wsl" };

    expect(check(printed(reportOf({ sandbox, node, disk: diskFree })), "Sandbox")).toEqual([
      "✕ Sandbox     can't start on this computer",
      "              Windows' Node.js can't start the sandbox in a WSL folder.",
      "              Fix: install Node.js inside WSL and open a WSL terminal. Then run halonic doctor again.",
      "              More: https://docs.halonic.dev/sandbox (windows-node-in-wsl)",
    ]);
  });

  it("names Windows' pnpm by its path", () => {
    const pnpm = "/mnt/c/nodejs/pnpm"; // leak-guard: allow absolute-path an example WSL drive
    const node: NodeLine = { check: "node", status: "warning", problem: "windows-pnpm", pnpm };

    expect(
      check(printed(reportOf({ sandbox: sandboxReady, node, disk: diskFree })), "Node.js"),
    ).toEqual([
      `! Node.js     pnpm on the PATH is Windows' one: ${pnpm}`,
      "              Fix: install pnpm inside WSL, for example with npm install -g pnpm, then run halonic doctor again.",
    ]);
  });
});

describe("doctorReportLines", () => {
  it("leaves out the lines the report doesn't have, outside a workspace", () => {
    const lines = printed(reportOf({ sandbox: sandboxReady, disk: diskFree }));
    expect(lines).toEqual([
      "Halonic 0.1.0 · Linux x64",
      "",
      "✓ Sandbox     ready · bubblewrap",
      "✓ Disk        48 GB free · Halonic uses 1.4 GB (run logs 1.1 GB)",
      "",
      "No problems.",
    ]);
  });

  it("keeps --dir in the suggested halonic trust, and words an unreadable record as not trusted", () => {
    const changed: WorkspaceLine = { ...trusted, status: "warning", trust: "changed" };
    const unreadable: WorkspaceLine = { ...trusted, status: "warning", trust: "unreadable" };
    const workspaceOf = (workspace: WorkspaceLine) =>
      check(
        printed(reportOf({ workspace, sandbox: sandboxReady, disk: diskFree }), {
          ...facts,
          dir: "./acme",
        }),
        "Workspace",
      );
    expect(workspaceOf(changed)).toEqual([
      "! Workspace   changed since you trusted it · halonic trust --dir ./acme",
    ]);
    expect(workspaceOf(unreadable)).toEqual([
      "! Workspace   not trusted yet · halonic trust --dir ./acme",
    ]);
    expect(workspaceOf({ ...trusted, trust: "not-needed" })).toEqual([
      "✓ Workspace   acme · test model only, no trust needed",
    ]);
    const refused: WorkspaceLine = { ...trusted, status: "warning", trust: "refused" };
    expect(workspaceOf(refused)).toEqual([
      "! Workspace   can't be trusted · halonic trust --dir ./acme",
    ]);
  });

  it("names both servers that don't answer, and the sandbox, in the summary", () => {
    const models: ModelsLine = {
      check: "models",
      status: "failed",
      ready: [],
      problems: [
        { problem: "unreachable", provider: "ollama", name: "Ollama", address: "localhost:11434" },
        {
          problem: "unreachable",
          provider: "lmstudio",
          name: "LM Studio",
          address: "localhost:1234",
        },
      ],
    };
    const lines = printed(reportOf({ models, sandbox: bubblewrapMissing, disk: diskFree }));
    expect(lines.at(-1)).toBe(
      "2 problems. Agents that use Ollama or LM Studio won't run until they answer. Agents set to run in a sandbox won't start until it's fixed.",
    );
  });

  it("shows an Ollama with nothing loaded, and models without a size", () => {
    const models: ModelsLine = {
      ...ollamaAndAnthropic,
      ready: [
        {
          provider: "ollama",
          name: "Ollama",
          answering: true,
          address: "localhost:11434",
          models: [],
        },
        {
          provider: "lmstudio",
          name: "LM Studio",
          answering: true,
          address: "localhost:1234",
          models: [{ name: "qwen3" }],
        },
      ],
    };
    const lines = printed(reportOf({ models, sandbox: sandboxReady, disk: diskFree }));
    expect(check(lines, "Models")).toEqual([
      "✓ Models      Ollama answering at localhost:11434",
      "              LM Studio answering at localhost:1234 · qwen3 loaded",
    ]);
  });

  it("links the sandbox page for a reason without its own section", () => {
    const windows: SandboxLine = { ...bubblewrapMissing, reason: "windows" };
    const lines = check(printed(reportOf({ sandbox: windows, disk: diskFree })), "Sandbox");
    expect(lines.at(-1)).toBe("              More: https://docs.halonic.dev/sandbox (windows)");
  });

  it("words the other harness problems and the low disk", () => {
    const harnesses: HarnessesLine = {
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
        { problem: "failed", harness: "codex", name: "Codex", error: "it timed out" },
      ],
    };
    const disk: DiskLine = { ...diskFree, status: "warning", freeBytes: 0.8 * gb, problem: "low" };
    const lines = printed(reportOf({ sandbox: sandboxReady, harnesses, disk }));
    expect(check(lines, "Harnesses")).toEqual([
      "! Harnesses   Claude Code 0.9.1 isn't supported. Halonic needs 1.0.0 or newer.",
      "              Fix: update Claude Code, then run halonic doctor again.",
      "              Halonic found Codex but couldn't ask its version: it timed out",
    ]);
    expect(check(lines, "Disk")).toEqual(["! Disk        Low on disk space: 0.8 GB free"]);
    expect(lines.at(-1)).toBe("No problems. 2 warnings.");
  });

  it("escapes the control characters in what a harness program said", () => {
    const harnesses: HarnessesLine = {
      check: "harnesses",
      status: "warning",
      installed: [{ harness: "claude-code", name: "Claude Code", version: "2.1.0\u001b[2J" }],
      problems: [
        {
          problem: "unsupported",
          harness: "claude-code",
          name: "Claude Code",
          version: "0.9.1\u001b[2J",
          supported: ">=1.0.0",
        },
        { problem: "failed", harness: "codex", name: "Codex", error: "it said \u001b[31mno" },
      ],
    };
    const lines = printed(reportOf({ sandbox: sandboxReady, harnesses, disk: diskFree }));
    expect(check(lines, "Harnesses")).toEqual([
      "! Harnesses   Claude Code 2.1.0\\u001b[2J",
      "              Claude Code 0.9.1\\u001b[2J isn't supported. Halonic needs 1.0.0 or newer.",
      "              Fix: update Claude Code, then run halonic doctor again.",
      "              Halonic found Codex but couldn't ask its version: it said \\u001b[31mno",
    ]);
  });

  it("says at least when the count stopped, and drops the use when a folder couldn't be read", () => {
    const partial: DiskLine = { ...diskFree, data: { ...data, complete: false } };
    const unknown: DiskLine = { ...diskFree, data: null };
    const diskOf = (disk: DiskLine) =>
      check(printed(reportOf({ sandbox: sandboxReady, disk })), "Disk");
    expect(diskOf(partial)).toEqual([
      "✓ Disk        48 GB free · Halonic uses at least 1.4 GB (run logs 1.1 GB)",
    ]);
    expect(diskOf(unknown)).toEqual(["✓ Disk        48 GB free"]);
  });

  it("writes the old console's marks", () => {
    const oldConsole = paintFor({ colour: false, live: false, unicode: false });
    const report = reportOf({ sandbox: sandboxReady, disk: diskFree });
    const [, , sandbox] = doctorReportLines(report, facts).map((line) =>
      renderPhrase(line, oldConsole),
    );
    expect(sandbox).toBe("ok Sandbox     ready - bubblewrap");
  });
});
