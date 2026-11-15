import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { editProvider } from "./provider-edits.ts";

const ollama =
  "version: 1\nid: ollama\n# my local server\nname: Ollama\ntype: ollama\nlocal: true\n";

verifies("models.providers.edit", () => {
  it("sets the base URL and keeps the file's comments", () => {
    const edited = editProvider(ollama, "baseUrl", "http://localhost:11434/v1", "ollama");

    expect(edited.ok && edited.value).toContain("baseUrl: http://localhost:11434/v1");
    expect(edited.ok && edited.value).toContain("# my local server");
  });

  it("writes nothing for a base URL without a scheme and names the problem", () => {
    expect(editProvider(ollama, "baseUrl", "localhost:11434", "ollama")).toEqual({
      ok: false,
      error: { field: "baseUrl", message: "Enter a full address, like http://localhost:11434/v1." },
    });
  });

  it("changes the secret name without touching anything else", () => {
    const text = "version: 1\nid: anthropic\ntype: anthropic\nsecret: anthropic\n";

    expect(editProvider(text, "secret", "anthropic-work", "anthropic")).toEqual({
      ok: true,
      value: "version: 1\nid: anthropic\ntype: anthropic\nsecret: anthropic-work\n",
    });
  });

  it("takes an emptied name or base URL out of the file", () => {
    const named = editProvider(ollama, "name", "  ", "ollama");

    expect(named.ok && named.value).not.toContain("name:");
  });

  it("turns local off and on", () => {
    const off = editProvider(ollama, "local", false, "ollama");

    expect(off.ok && off.value).toContain("local: false");
  });

  it("refuses an empty type", () => {
    const edited = editProvider(ollama, "type", "", "ollama");

    expect(edited.ok).toBe(false);
  });

  it("takes an emptied base URL and secret name out of the file", () => {
    const text =
      "version: 1\nid: ollama\ntype: ollama\nbaseUrl: http://localhost:11434/v1\nsecret: ollama-key\n";
    const noUrl = editProvider(text, "baseUrl", "", "ollama");
    const noSecret = editProvider(text, "secret", " ", "ollama");

    expect(noUrl.ok && noUrl.value).not.toContain("baseUrl");
    expect(noSecret.ok && noSecret.value).not.toContain("secret");
  });

  it("refuses a key pasted as the secret name, writes nothing and never repeats it", () => {
    const key = `sk-ant-api03-${"Q7x2Lm9K".repeat(4)}`;
    const edited = editProvider(ollama, "secret", key, "ollama");

    expect(edited.ok).toBe(false);
    expect(!edited.ok && edited.error.field).toBe("secret");
    expect(JSON.stringify(edited)).not.toContain(key);
    expect(!edited.ok && edited.error.message).toContain("looks like an API key");
  });

  it("refuses a secret name that breaks the name rule", () => {
    const edited = editProvider(ollama, "secret", "Hunter2!x", "ollama");

    expect(!edited.ok && edited.error.field).toBe("secret");
    expect(JSON.stringify(edited)).not.toContain("Hunter2");
  });

  it("blames the file, not the field, when the file was already broken", () => {
    const edited = editProvider("version: 1\nid: ollama\n", "name", "Ollama", "ollama");

    expect(!edited.ok && edited.error.field).toBe("yaml");
  });
});
