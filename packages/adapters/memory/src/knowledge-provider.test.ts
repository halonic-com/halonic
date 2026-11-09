import type { KnowledgeDoc } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryKnowledgeProvider } from "./knowledge-provider.ts";

function doc(ref: string, content: string, title = ref): KnowledgeDoc {
  return { ref, title, content };
}

verifies("memory.knowledge-provider", () => {
  it("is called memory unless named, and searches unless told not to", () => {
    const plain = new MemoryKnowledgeProvider([]);
    expect(plain.id).toBe("memory");
    expect(plain.capabilities).toEqual({ search: true, semantic: false, ingest: false });
    expect(plain.untrusted).toBe(false);
    const named = new MemoryKnowledgeProvider([], { id: "handbook", search: false });
    expect(named.id).toBe("handbook");
    expect(named.capabilities.search).toBe(false);
  });

  it("scores one per matching whole word, ignoring case, and breaks ties by ref", async () => {
    const provider = new MemoryKnowledgeProvider([
      doc("b.md", "Tea, TEA and tea."),
      doc("c.md", "Tea once."),
      doc("a.md", "Tea once, teapot does not count."),
      doc("d.md", "Coffee only."),
    ]);
    const hits = await provider.search("tea");
    expect(hits.map(({ ref, score }) => ({ ref, score }))).toEqual([
      { ref: "b.md", score: 3 },
      { ref: "a.md", score: 1 },
      { ref: "c.md", score: 1 },
    ]);
  });

  it("gives at most ten hits unless a limit is set", async () => {
    const docs = Array.from({ length: 12 }, (_, i) =>
      doc(`${String(i).padStart(2, "0")}.md`, "tea"),
    );
    const provider = new MemoryKnowledgeProvider(docs);
    expect(await provider.search("tea")).toHaveLength(10);
    expect(await provider.search("tea", { limit: 12 })).toHaveLength(12);
  });

  it("starts the snippet at the first query word, or at the start when only the title matched", async () => {
    const long = `${"x".repeat(100)} İstanbul kettle ${"y".repeat(100)}`;
    const provider = new MemoryKnowledgeProvider([
      doc("long.md", long),
      doc("title.md", "Nothing here.", "Kettle guide"),
    ]);
    const [first, second] = await provider.search("KETTLE");
    // "İ" lower-cases to two characters, so a position found in lower-cased text would be off by one.
    const at = long.indexOf("kettle");
    expect(first?.snippet).toBe(long.slice(at, at + 80));
    expect(second).toMatchObject({ ref: "title.md", snippet: "Nothing here." });
  });

  it("keeps its own copy of the documents it was given", async () => {
    const given = doc("a.md", "tea");
    const provider = new MemoryKnowledgeProvider([given]);
    given.content = "changed";
    expect(await provider.get("a.md")).toEqual(doc("a.md", "tea"));
  });
});
