import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { PickMessage } from "./pick-model-state.ts";
import {
  buttonLabel,
  getKeyLink,
  keySavedLine,
  localLine,
  messageText,
  trustLine,
} from "./pick-model-words.ts";

verifies("first-run.pick-model", () => {
  describe("the trust line", () => {
    it("names the secret and Local only for a key", () => {
      const line = trustLine({
        reaches: { name: "Anthropic", secrets: 1, host: undefined, local: false },
        localOnlyOff: true,
      });
      expect(line).toBe("Will pass 1 secret to Anthropic. Turns off Local only.");
    });

    it("names the host for a local model", () => {
      const line = trustLine({
        reaches: { name: "Ollama", secrets: 0, host: "localhost:11434", local: true },
        localOnlyOff: false,
      });
      expect(line).toBe("Will reach Ollama at localhost:11434");
    });

    it("says only Local only when no provider is added, and nothing when nothing changes", () => {
      expect(trustLine({ reaches: undefined, localOnlyOff: true })).toBe("Turns off Local only.");
      expect(trustLine({ reaches: undefined, localOnlyOff: false })).toBeUndefined();
    });
  });

  it("words the local option's states", () => {
    expect(localLine({ kind: "one", model: "llama3.2" })).toBe("Found Ollama · llama3.2");
    expect(localLine({ kind: "several", models: ["a", "b"] })).toBe("Found Ollama");
    expect(localLine({ kind: "none-downloaded" })).toContain("has no model yet");
    expect(localLine({ kind: "not-found", cause: "off" })).toBe("No model found on this computer.");
    expect(localLine({ kind: "desktop-only" })).toBe("Local models need the desktop app.");
    expect(localLine({ kind: "checking" })).toBe("Looking for a model on this computer…");
  });

  it("labels the button by what it waits for", () => {
    expect(buttonLabel("check-again", { kind: "checking" })).toBe("Checking…");
    expect(buttonLabel("continue", { kind: "saving" })).toBe("Saving…");
    expect(buttonLabel("test-and-continue", undefined)).toBe("Test and continue");
    expect(getKeyLink("gemini")).toBe("Get one from Gemini ↗");
    expect(keySavedLine("openai")).toBe("A key is saved for OpenAI");
  });

  it.each<[PickMessage, string]>([
    [
      { kind: "not-a-key", problem: { kind: "url", keyStart: "sk-ant-" } },
      "It usually starts with sk-ant-",
    ],
    [
      { kind: "files", problem: { kind: "unreadable", file: "models.yaml" } },
      "can't read models.yaml",
    ],
    [
      { kind: "files", problem: { kind: "provider-differs", file: "providers/anthropic.yaml" } },
      "set up another way",
    ],
    [{ kind: "tested", outcome: "key-refused" }, "Anthropic didn't accept this key."],
    [{ kind: "tested", outcome: "offline" }, "Studio can't reach Anthropic."],
    [{ kind: "tested", outcome: "provider-error" }, "Anthropic isn't answering right now."],
    [{ kind: "tested", outcome: "local-not-answering" }, "Check that Ollama is running"],
    [{ kind: "tested", outcome: "local-not-usable" }, "It may be too small."],
    [{ kind: "line-changed" }, "then press Continue"],
    [{ kind: "not-saved", failed: "no-test", keySaved: false }, "Test again."],
    [{ kind: "not-saved", failed: "files", keySaved: false }, "now stops this choice"],
    [{ kind: "not-saved", failed: "key", keySaved: false }, "couldn't keep the key"],
    [{ kind: "not-saved", failed: "no-save", keySaved: false }, "Use Sample answers."],
    [{ kind: "not-saved", failed: "write", keySaved: true }, "The key is kept on this computer."],
    [{ kind: "broke" }, "couldn't test this choice"],
  ])("words %j", (message, words) => {
    expect(messageText(message, "anthropic")).toContain(words);
  });
});
