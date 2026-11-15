import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { editKnowledgeText, readKnowledgeText } from "./knowledge-text.ts";

const source = [
  "version: 1",
  "id: handbook",
  "name: Handbook # shown in the list",
  "summary: Old summary",
  "provider: files",
  "mode: auto",
  "writable: true",
  "config:",
  "  folder: docs",
  "",
].join("\n");

function edited(change: Parameters<typeof editKnowledgeText>[1], text = source): string {
  const result = editKnowledgeText(text, change);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

verifies("app.knowledge-text", () => {
  it("reads the parts", () => {
    expect(readKnowledgeText(source)).toEqual({
      ok: true,
      value: {
        name: "Handbook",
        summary: "Old summary",
        mode: "auto",
        writable: true,
        provider: "files",
      },
    });
  });

  it("reads a source without mode as tools and without a summary as empty", () => {
    expect(readKnowledgeText("id: kb\nprovider: files\n")).toEqual({
      ok: true,
      value: { name: "", summary: "", mode: "tools", writable: false, provider: "files" },
    });
  });

  it("removes mode when tools is picked and keeps everything else", () => {
    expect(edited({ mode: "tools" })).toBe(source.replace("mode: auto\n", ""));
  });

  it("writes mode: auto when auto is picked", () => {
    const plain = "id: kb\nprovider: files\n";
    expect(edited({ mode: "auto" }, plain)).toBe("id: kb\nprovider: files\nmode: auto\n");
  });

  it("writes the summary trimmed and keeps the comment", () => {
    const text = edited({ summary: "  Refund timing, one page per topic.  " });
    expect(text).toBe(source.replace("Old summary", "Refund timing, one page per topic."));
    expect(text).toContain("# shown in the list");
  });

  it("removes the summary when it is null or empty", () => {
    expect(edited({ summary: null })).toBe(source.replace("summary: Old summary\n", ""));
    expect(edited({ summary: "  " })).toBe(source.replace("summary: Old summary\n", ""));
  });

  it("writes nothing when the given parts are unchanged", () => {
    expect(edited({ summary: "Old summary", mode: "auto" })).toBe(source);
    expect(edited({ summary: null }, "id: kb\nprovider: files\n")).toBe(
      "id: kb\nprovider: files\n",
    );
  });

  it("refuses text that isn't a YAML map", () => {
    expect(readKnowledgeText("- a\n- b\n")).toEqual({ ok: false, error: "unreadable" });
    expect(editKnowledgeText("a: [\n", { mode: "auto" })).toEqual({
      ok: false,
      error: "unreadable",
    });
  });
});
