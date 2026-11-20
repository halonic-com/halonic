import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Message } from "./define.ts";
import { doctorMessages } from "./doctor.ts";
import { plainText } from "./phrase.ts";

const words = (message: Message) => plainText(message.phrase);
const use = { total: "1.4 GB", runLogs: "1.1 GB" };

verifies("words.doctor", () => {
  it("has doctor's lines word for word, from cli-output 3.7", () => {
    const loaded = doctorMessages.loaded([{ name: "llama3.2", size: "2.0 GB" }]).phrase;
    expect(doctorMessages.heading("0.1.0", "Linux x64").key).toBe("doctor.heading");
    expect([
      words(doctorMessages.heading("0.1.0", "Linux x64")),
      words(doctorMessages.trusted("acme")),
      words(doctorMessages.answering("Ollama", "localhost:11434", loaded)),
      words(doctorMessages.keyStored("Anthropic")),
      words(doctorMessages.sandboxCantStart()),
      words(doctorMessages.diskFree("48 GB", use)),
      `${words(doctorMessages.problems(1))} ${words(doctorMessages.sandboxStops())}`,
    ]).toEqual([
      "Halonic 0.1.0 · Linux x64",
      "acme · trusted on this computer",
      "Ollama answering at localhost:11434 · llama3.2 loaded (2.0 GB)",
      "Anthropic: API key stored",
      "can't start on this computer",
      "48 GB free · Halonic uses 1.4 GB (run logs 1.1 GB)",
      "1 problem. Agents set to run in a sandbox won't start until it's fixed.",
    ]);
  });

  it("keys each sentence by its area and name, with the Unicode marks in its plain text", () => {
    const free = doctorMessages.diskFree("48 GB", { total: "1.4 GB", runLogs: "1.1 GB" });
    expect(free.key).toBe("doctor.diskFree");
    expect(plainText(free.phrase)).toBe("48 GB free · Halonic uses 1.4 GB (run logs 1.1 GB)");
  });

  it("takes a command as given and draws the separator as a mark", () => {
    const changed = doctorMessages.changedSinceTrusted('halonic trust --dir "./my agents"');
    expect(changed.phrase).toEqual([
      "changed since you trusted it ",
      { mark: "separator" },
      ' halonic trust --dir "./my agents"',
    ]);
    expect(plainText(doctorMessages.fileProblems("acme", 1, "halonic validate").phrase)).toBe(
      "acme · 1 problem in its files · halonic validate",
    );
  });

  it("says a check didn't answer in its limit", () => {
    expect(plainText(doctorMessages.didntAnswer(5).phrase)).toBe("didn't answer in 5 seconds");
  });
});

describe("doctor's sentences", () => {
  it("has the summary and the labels", () => {
    expect(words(doctorMessages.summary())).toBe(
      "Check this computer's sandbox and disk, and a workspace's models",
    );
    expect([
      words(doctorMessages.workspaceLabel()),
      words(doctorMessages.modelsLabel()),
      words(doctorMessages.sandboxLabel()),
      words(doctorMessages.diskLabel()),
    ]).toEqual(["Workspace", "Models", "Sandbox", "Disk"]);
  });

  it("has the workspace's warnings, with the command as given", () => {
    expect(words(doctorMessages.notTrusted("halonic trust"))).toBe(
      "not trusted yet · halonic trust",
    );
    expect(words(doctorMessages.changedSinceTrusted("halonic trust --dir ./acme"))).toBe(
      "changed since you trusted it · halonic trust --dir ./acme",
    );
    expect(words(doctorMessages.refused("halonic trust --dir ./acme"))).toBe(
      "can't be trusted · halonic trust --dir ./acme",
    );
  });

  it("has the models' other lines, one per provider for aliases without a key", () => {
    expect(words(doctorMessages.answering("Ollama", "localhost:11434"))).toBe(
      "Ollama answering at localhost:11434",
    );
    expect(words(doctorMessages.needKey(["smart"], "Anthropic"))).toBe(
      "smart needs an API key for Anthropic.",
    );
    expect(words(doctorMessages.needKey(["smart", "writer"], "Anthropic"))).toBe(
      "smart and writer need an API key for Anthropic.",
    );
    expect(words(doctorMessages.needKey(["smart", "writer", "fast"], "Anthropic"))).toBe(
      "smart, writer and fast need an API key for Anthropic.",
    );
    expect(words(doctorMessages.notAnswering("Ollama", "localhost:11434"))).toBe(
      "Ollama isn't answering at localhost:11434",
    );
  });

  it("lists every loaded model, with its size when the server says it", () => {
    const loaded = doctorMessages.loaded([{ name: "llama3.2", size: "2.0 GB" }, { name: "qwen3" }]);
    expect(words(loaded)).toBe("llama3.2 loaded (2.0 GB), qwen3 loaded");
  });

  it("has the sandbox's ready line", () => {
    expect(words(doctorMessages.sandboxReady("bubblewrap"))).toBe("ready · bubblewrap");
  });

  it("has the disk's other lines from the team's calls of revision 20", () => {
    expect(words(doctorMessages.diskFree("48 GB"))).toBe("48 GB free");
    expect(words(doctorMessages.diskFree("48 GB", { ...use, atLeast: true }))).toBe(
      "48 GB free · Halonic uses at least 1.4 GB (run logs 1.1 GB)",
    );
    expect(words(doctorMessages.lowOnDisk("0.8 GB"))).toBe("Low on disk space: 0.8 GB free");
    expect(words(doctorMessages.freeUnknown(use))).toBe(
      "free space unknown · Halonic uses 1.4 GB (run logs 1.1 GB)",
    );
    expect(words(doctorMessages.freeUnknown())).toBe("free space unknown");
    expect(words(doctorMessages.freeUnknownReason())).toBe(
      "Halonic couldn't read the free space on this drive.",
    );
  });

  it("has the Harnesses line's placeholder words from P5", () => {
    expect([
      words(doctorMessages.harnessesLabel()),
      words(doctorMessages.harnessReady("Claude Code", "2.1.0")),
      words(doctorMessages.harnessMissing("Writer", "Codex")),
      words(doctorMessages.installHarness("Codex")),
      words(doctorMessages.harnessUnsupported("Claude Code", "0.9.1", ">=1.0.0")),
      words(doctorMessages.updateHarness("Claude Code")),
      words(doctorMessages.harnessVersionFailed("Claude Code", "it timed out")),
    ]).toEqual([
      "Harnesses",
      "Claude Code 2.1.0",
      "Writer uses Codex, and it isn't installed.",
      "Fix: install Codex, then run halonic doctor again.",
      "Claude Code 0.9.1 isn't supported. Halonic needs 1.0.0 or newer.",
      "Fix: update Claude Code, then run halonic doctor again.",
      "Halonic found Claude Code but couldn't ask its version: it timed out",
    ]);
  });

  it("counts problems and warnings in the summary", () => {
    expect(words(doctorMessages.noProblems())).toBe("No problems.");
    expect(words(doctorMessages.problems(2))).toBe("2 problems.");
    expect(words(doctorMessages.warnings(1))).toBe("1 warning.");
    expect(words(doctorMessages.warnings(3))).toBe("3 warnings.");
  });

  it("says what a Models ✕ stops, before the sandbox and the warnings", () => {
    const summary = (...parts: Message[]) => parts.map(words).join(" ");
    expect([
      summary(doctorMessages.problems(1), doctorMessages.modelsStop(["Ollama"])),
      summary(doctorMessages.problems(1), doctorMessages.modelsStop(["Ollama", "LM Studio"])),
      summary(
        doctorMessages.problems(2),
        doctorMessages.modelsStop(["Ollama"]),
        doctorMessages.sandboxStops(),
      ),
      summary(
        doctorMessages.problems(1),
        doctorMessages.sandboxStops(),
        doctorMessages.warnings(1),
      ),
      summary(doctorMessages.noProblems(), doctorMessages.warnings(1)),
    ]).toEqual([
      "1 problem. Agents that use Ollama won't run until it answers.",
      "1 problem. Agents that use Ollama or LM Studio won't run until they answer.",
      "2 problems. Agents that use Ollama won't run until it answers. Agents set to run in a sandbox won't start until it's fixed.",
      "1 problem. Agents set to run in a sandbox won't start until it's fixed. 1 warning.",
      "No problems. 1 warning.",
    ]);
  });

  it("has the Workspace line's other sentences", () => {
    expect(words(doctorMessages.action())).toBe("check this computer");
    expect(words(doctorMessages.action("./downloads"))).toBe("check ./downloads");
    expect(words(doctorMessages.nodeLabel())).toBe("Node.js");
    expect(words(doctorMessages.testModelOnly("acme"))).toBe(
      "acme · test model only, no trust needed",
    );
    expect(words(doctorMessages.onWindowsDrive("/mnt/c"))).toBe(
      "The workspace is on the Windows drive /mnt/c, so runs are slower. If Studio on Windows opens this folder, keep it there.",
    );
    expect(words(doctorMessages.moveToLinuxHome())).toBe(
      "Fix: if you use it only from the command line, move it into your Linux home folder (~), then run halonic doctor again.",
    );
    expect(words(doctorMessages.tooManyFilesToWatch(50_000))).toBe(
      "The workspace has more than 50,000 files, too many for Studio to watch for changes made outside Halonic.",
    );
    expect(words(doctorMessages.openSmallerFolder())).toBe(
      "Fix: to see them in Studio as they happen, open a smaller folder, or move files the workspace doesn't use out of this one.",
    );
  });

  it("has the Node.js line's sentences and fixes", () => {
    const pnpm = "/mnt/c/nodejs/pnpm"; // leak-guard: allow absolute-path an example WSL drive
    expect(
      [
        doctorMessages.windowsNodeInWsl(),
        doctorMessages.installNodeInWsl(),
        doctorMessages.windowsPnpm(pnpm),
        doctorMessages.installPnpmInWsl(),
      ].map(words),
    ).toEqual([
      "This is Windows' Node.js, running in a WSL folder.",
      "Fix: install Node.js inside WSL, then run halonic doctor again from a WSL terminal.",
      `pnpm on the PATH is Windows' one: ${pnpm}`,
      "Fix: install pnpm inside WSL, for example with npm install -g pnpm, then run halonic doctor again.",
    ]);
  });
});

verifies("cli.doctor-secrets", () => {
  it("names each missing secret, what uses it and the command that sets it", () => {
    const files = { kind: "connector", id: "files" } as const;
    const notes = { kind: "connector", id: "notes" } as const;
    const mock = { kind: "provider", id: "mock" } as const;
    const friday = { kind: "routine", id: "friday-digest" } as const;
    expect([
      words(doctorMessages.secretsLabel()),
      words(doctorMessages.secretNotSet("files-token", [files], "files-token")),
      words(doctorMessages.secretNotSet("shared token", [files, notes, mock], '"shared token"')),
      words(doctorMessages.secretUnreadable("files-token", [files])),
      words(doctorMessages.secretNotSet("friday-hook", [friday], "friday-hook")),
    ]).toEqual([
      "Secrets",
      "files-token isn't set (connector files) · halonic secret set files-token",
      'shared token isn\'t set (connectors files and notes, provider mock) · halonic secret set "shared token"',
      "couldn't read files-token from the secret store (connector files)",
      "friday-hook isn't set (routine friday-digest) · halonic secret set friday-hook",
    ]);
  });
});
