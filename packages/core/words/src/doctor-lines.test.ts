import type {
  DiskLine,
  HarnessesLine,
  ModelsLine,
  NetworkLine,
  SecretsLine,
  WorkspaceLine,
} from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  type DoctorFace,
  type DoctorLineItem,
  doctorLineWords,
  timedOutWords,
  type WordedLine,
} from "./doctor-lines.ts";
import { plainText } from "./phrase.ts";

const gb = 1024 ** 3;
const face: DoctorFace = {
  trustCommand: "halonic trust --dir ./acme",
  validateCommand: "halonic validate --dir ./acme",
  signInShell: "sh",
  shellWord: (text) => (/^[\w./:-]+$/u.test(text) ? text : `"${text}"`),
};

/** Each item as text: a fix and a docs link marked, so a test sees which is which. */
function itemText(item: DoctorLineItem): string {
  if ("docs" in item) return `docs: ${item.docs}`;
  return "fix" in item ? `fix: ${plainText(item.fix)}` : plainText(item.sentence);
}

function worded(line: WordedLine): { label: string; items: string[] } {
  const words = doctorLineWords(line, face);
  return { label: plainText(words.label.phrase), items: words.items.map(itemText) };
}

function workspace(fields: Partial<WorkspaceLine>): WorkspaceLine {
  return { check: "workspace", status: "warning", name: "acme", trust: "trusted", ...fields };
}

verifies("words.doctor-lines", () => {
  it("words the workspace's trust with the face's command", () => {
    expect(worded(workspace({ trust: "changed" }))).toEqual({
      label: "Workspace",
      items: ["changed since you trusted it · halonic trust --dir ./acme"],
    });
    expect(
      (["trusted", "not-needed", "refused", "new", "unreadable"] as const).map(
        (trust) => worded(workspace({ trust })).items[0],
      ),
    ).toEqual([
      "acme · trusted on this computer",
      "acme · test model only, no trust needed",
      "can't be trusted · halonic trust --dir ./acme",
      "not trusted yet · halonic trust --dir ./acme",
      "not trusted yet · halonic trust --dir ./acme",
    ]);
    expect(worded(workspace({ trust: "new", fileProblems: 2 })).items).toEqual([
      "acme · 2 problems in its files · halonic validate --dir ./acme",
    ]);
  });

  it("puts the Windows drive's fix and docs link, then the watch limit's fix, under the trust", () => {
    const line = workspace({ windowsDrive: "/mnt/c", tooManyFilesToWatch: 50_000 });
    expect(worded(line).items).toEqual([
      "acme · trusted on this computer",
      "The workspace is on the Windows drive /mnt/c, so runs are slower. If Studio on Windows opens this folder, keep it there.",
      "fix: Fix: if you use it only from the command line, move it into your Linux home folder (~), then run halonic doctor again.",
      "docs: https://docs.halonic.dev/security/sandbox/#wsl2-folder",
      "The workspace has more than 50,000 files, too many for Studio to watch for changes made outside Halonic.",
      "fix: Fix: to see them in Studio as they happen, open a smaller folder, or move files the workspace doesn't use out of this one.",
    ]);
  });

  it("names a provider's aliases without a key once, and a server that doesn't answer first", () => {
    const models: ModelsLine = {
      check: "models",
      status: "failed",
      ready: [
        {
          provider: "ollama",
          name: "Ollama",
          answering: true,
          address: "localhost:11434",
          models: [{ name: "llama3.2", memoryBytes: 2 * gb }, { name: "qwen3" }],
        },
        {
          provider: "lmstudio",
          name: "LM Studio",
          answering: true,
          address: "localhost:1234",
          models: [],
        },
        { provider: "openai", name: "OpenAI", keyStored: true },
      ],
      problems: [
        { problem: "unreachable", provider: "vllm", name: "vLLM", address: "localhost:8000" },
        { problem: "no-key", alias: "smart", provider: "anthropic", name: "Anthropic" },
        { problem: "no-key", alias: "writer", provider: "anthropic", name: "Anthropic" },
      ],
    };
    expect(worded(models)).toEqual({
      label: "Models",
      items: [
        "Ollama answering at localhost:11434 · llama3.2 loaded (2.0 GB), qwen3 loaded",
        "LM Studio answering at localhost:1234",
        "OpenAI: API key stored",
        "vLLM isn't answering at localhost:8000",
        "smart and writer need an API key for Anthropic.",
      ],
    });
  });

  it("shows text from outside Halonic as printable", () => {
    const models: ModelsLine = {
      check: "models",
      status: "ok",
      ready: [{ provider: "x", name: "Evil\u001b[31m", keyStored: true }],
      problems: [],
    };
    expect(worded(models).items).toEqual(["Evil\\u001b[31m: API key stored"]);
  });

  it("names each secret that isn't set with what uses it and the face's command, then the unreadable ones", () => {
    const line: SecretsLine = {
      check: "secrets",
      status: "failed",
      missing: [
        { secret: "files-token", usedBy: [{ kind: "connector", id: "files" }] },
        {
          secret: "my key",
          usedBy: [
            { kind: "connector", id: "notes" },
            { kind: "routine", id: "friday-digest" },
          ],
        },
      ],
      unreadable: [{ secret: "mock-key", usedBy: [{ kind: "provider", id: "mock" }] }],
    };
    expect(worded(line)).toEqual({
      label: "Secrets",
      items: [
        "files-token isn't set (connector files) · halonic secret set files-token",
        'my key isn\'t set (connector notes, routine friday-digest) · halonic secret set "my key"',
        "couldn't read mock-key from the secret store (provider mock)",
      ],
    });
  });

  it("words the Network line's proxy of another kind, and one that can't be used with its reason", () => {
    const notHttp: NetworkLine = {
      check: "network",
      status: "warning",
      problem: "proxy-not-http",
      variable: "HTTPS_PROXY",
      scheme: "https",
    };
    expect(worded(notHttp)).toEqual({
      label: "Network",
      items: ["HTTPS_PROXY is an https:// proxy; Halonic only uses http:// proxies"],
    });
    const unusable: NetworkLine = {
      check: "network",
      status: "warning",
      problem: "proxy-unusable",
      variable: "HTTP_PROXY",
      reason: "It has no host.",
    };
    expect(worded(unusable).items).toEqual([
      "HTTP_PROXY is set, and Halonic can't use it.",
      "It has no host.",
    ]);
  });

  it("lists the ready harnesses on one line, then each problem with its fix", () => {
    const harnesses: HarnessesLine = {
      check: "harnesses",
      status: "warning",
      installed: [
        { harness: "claude-code", name: "Claude Code", version: "2.1.0" },
        { harness: "codex", name: "Codex", version: "0.9.0" },
      ],
      problems: [
        { problem: "missing", agent: "Writer", harness: "gemini", name: "Gemini CLI" },
        {
          problem: "unsupported",
          harness: "codex",
          name: "Codex",
          version: "0.9.0",
          supported: ">=1.0.0",
        },
        { problem: "failed", harness: "claude-code", name: "Claude Code", error: "exit 1" },
        {
          problem: "signed-out",
          agent: "Writer",
          harness: "claude-code",
          name: "Claude Code",
          signIn: {
            program: "claude",
            args: ["auth", "login"],
            folderVariable: "CLAUDE_CONFIG_DIR",
          },
          settingsFolder: "/data/harness-settings/writer/claude-code",
        },
      ],
    };
    expect(worded(harnesses)).toEqual({
      label: "Harnesses",
      items: [
        "Claude Code 2.1.0 · Codex 0.9.0",
        "Writer uses Gemini CLI, and it isn't installed.",
        "fix: Fix: install Gemini CLI, then run halonic doctor again.",
        "Codex 0.9.0 isn't supported. Halonic needs 1.0.0 or newer.",
        "fix: Fix: update Codex, then run halonic doctor again.",
        "Halonic found Claude Code but couldn't ask its version: exit 1",
        "Claude Code isn't signed in for Writer.",
        "fix: Fix: sign in for Writer with CLAUDE_CONFIG_DIR='/data/harness-settings/writer/claude-code' claude auth login",
      ],
    });
    const none: HarnessesLine = {
      ...harnesses,
      installed: [],
      problems: harnesses.problems.slice(2, 3),
    };
    expect(worded(none).items).toEqual([
      "Halonic found Claude Code but couldn't ask its version: exit 1",
    ]);
  });

  it("words the Node.js line's two problems with their fixes", () => {
    const pnpm = "/mnt/c/nodejs/pnpm"; // leak-guard: allow absolute-path an example WSL drive
    expect(worded({ check: "node", status: "warning", problem: "windows-node-in-wsl" })).toEqual({
      label: "Node.js",
      items: [
        "This is Windows' Node.js, running in a WSL folder.",
        "fix: Fix: install Node.js inside WSL, then run halonic doctor again from a WSL terminal.",
      ],
    });
    expect(
      worded({ check: "node", status: "warning", problem: "windows-pnpm", pnpm }).items,
    ).toEqual([
      `pnpm on the PATH is Windows' one: ${pnpm}`,
      "fix: Fix: install pnpm inside WSL, for example with npm install -g pnpm, then run halonic doctor again.",
    ]);
  });

  it("words the disk's free space, low space, and space it couldn't read", () => {
    const data = { bytes: 1.4 * gb, runLogBytes: 1.1 * gb, complete: true };
    const disk = (fields: Partial<DiskLine>): DiskLine => ({
      check: "disk",
      status: "ok",
      freeBytes: 48 * gb,
      data,
      problem: null,
      ...fields,
    });
    expect(worded(disk({}))).toEqual({
      label: "Disk",
      items: ["48 GB free · Halonic uses 1.4 GB (run logs 1.1 GB)"],
    });
    expect(worded(disk({ data: { ...data, complete: false } })).items).toEqual([
      "48 GB free · Halonic uses at least 1.4 GB (run logs 1.1 GB)",
    ]);
    expect(worded(disk({ freeBytes: 0.8 * gb, problem: "low" })).items).toEqual([
      "Low on disk space: 0.8 GB free",
    ]);
    expect(worded(disk({ freeBytes: null, data: null, problem: "unreadable" })).items).toEqual([
      "free space unknown",
      "Halonic couldn't read the free space on this drive.",
    ]);
  });

  it("says a check that ran over its limit didn't answer, the Sandbox's included", () => {
    expect(worded({ check: "disk", status: "warning", timedOut: true })).toEqual({
      label: "Disk",
      items: ["didn't answer in 5 seconds"],
    });
    const sandbox = timedOutWords("sandbox");
    expect(plainText(sandbox.label.phrase)).toBe("Sandbox");
    expect(sandbox.items.map(itemText)).toEqual(["didn't answer in 5 seconds"]);
  });
});

describe("doctorLineWords", () => {
  it("keys the label as the CLI's catalogue does", () => {
    expect(doctorLineWords(workspace({}), face).label.key).toBe("doctor.workspaceLabel");
  });
});
