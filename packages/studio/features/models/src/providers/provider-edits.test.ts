import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { editProvider } from "./provider-edits.ts";

const ollama =
  "version: 1\nid: ollama\n# my local server\nname: Ollama\ntype: ollama\nlocal: true\n";

verifies("models.providers.edit", () => {
  it("sets the base URL and keeps the file's comments", () => {
    const edited = editProvider(ollama, "baseUrl", "http://localhost:11434/v1");

    expect(edited.ok && edited.value).toContain("baseUrl: http://localhost:11434/v1");
    expect(edited.ok && edited.value).toContain("# my local server");
  });

  it("writes nothing for a base URL without a scheme and names the problem", () => {
    expect(editProvider(ollama, "baseUrl", "localhost:11434")).toEqual({
      ok: false,
      error: { field: "baseUrl", message: "Enter a full address, like http://localhost:11434/v1." },
    });
  });

  it("changes the secret name without touching anything else", () => {
    const text = "version: 1\nid: anthropic\ntype: anthropic\nsecret: anthropic\n";

    expect(editProvider(text, "secret", "anthropic-work")).toEqual({
      ok: true,
      value: "version: 1\nid: anthropic\ntype: anthropic\nsecret: anthropic-work\n",
    });
  });

  it("takes an emptied name or base URL out of the file", () => {
    const named = editProvider(ollama, "name", "  ");

    expect(named.ok && named.value).not.toContain("name:");
  });

  it("turns local off and on", () => {
    const off = editProvider(ollama, "local", false);

    expect(off.ok && off.value).toContain("local: false");
  });

  it("refuses an empty type", () => {
    const edited = editProvider(ollama, "type", "");

    expect(edited.ok).toBe(false);
  });
});
