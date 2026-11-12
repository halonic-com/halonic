import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { paintFor } from "../output/paint.ts";
import type { Message } from "./define.ts";
import { doctorMessages } from "./doctor.ts";
import { plainText, renderPhrase } from "./phrase.ts";

const words = (message: Message) => plainText(message.phrase);
const use = { total: "1.4 GB", runLogs: "1.1 GB" };

verifies("cli.messages", () => {
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

  it("has the workspace's warnings, with the user's --dir and - for · without UTF-8", () => {
    expect(words(doctorMessages.notTrusted())).toBe("not trusted yet · halonic trust");
    expect(words(doctorMessages.changedSinceTrusted("./acme"))).toBe(
      "changed since you trusted it · halonic trust --dir ./acme",
    );
    const oldConsole = paintFor({ colour: false, live: false, unicode: false });
    expect(renderPhrase(doctorMessages.notTrusted().phrase, oldConsole)).toBe(
      "not trusted yet - halonic trust",
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
});
