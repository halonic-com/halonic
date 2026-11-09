import type { KnowledgeDoc, KnowledgeProvider } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** A file next to the source but outside it, which the source must never show. */
export interface OutsideFile {
  /** Relative to the source's folder, so it always starts with `../`. */
  path: string;
  content: string;
}

/** What the source under test is created with. */
export interface KnowledgeSeed {
  /** The documents the source holds, with the refs and titles it gives them. */
  docs: readonly KnowledgeDoc[];
  /**
   * Files the adapter's environment holds outside the source, such as files
   * in the folder above it. An adapter with no such place ignores them.
   */
  outside: readonly OutsideFile[];
}

/** Creates the knowledge source under test, holding exactly `seed.docs`. */
export type MakeKnowledgeProvider = (seed: KnowledgeSeed) => Promise<KnowledgeProvider>;

/** Documents whose words don't overlap, so a word from one finds only that one. */
export const knowledgeDocs: readonly KnowledgeDoc[] = [
  {
    ref: "guides/setup.md",
    title: "Setting up",
    content: "Install the Studio, then open a workspace.\nThe kettle is optional.",
  },
  {
    ref: "guides/invoices.md",
    title: "Invoices",
    content: "Each invoice goes to the bookkeeper by Friday. Late invoices get a reminder.",
  },
  {
    ref: "notes/café.md",
    title: "Café rota",
    content: "Wöchentlich: Monday is Ana, Tuesday is Bo. 🫖",
  },
];

/** A file beside the source holding a word no source document has. */
export const outsideFiles: readonly OutsideFile[] = [
  { path: "../private.md", content: "The safe code is zanzibar." },
  { path: "../other-hub/notes/zanzibar.md", content: "zanzibar again" },
];

/**
 * Refs that name no document, including ones that try to leave the source. A
 * ref names a document exactly, so another spelling of a held one names none.
 */
export const unknownKnowledgeRefs: readonly string[] = [
  "guides/missing.md",
  "",
  "guides",
  "../private.md",
  "guides/../../private.md",
  "guides/../guides/setup.md",
  "./guides/setup.md",
  "guides//setup.md",
  "guides/setup.md/",
  "guides/setup.md\u0000",
  "..\\private.md",
  "guides\\..\\..\\private.md",
  "../other-hub/notes/zanzibar.md",
  "/etc/passwd",
  "C:\\private.md", // leak-guard: allow absolute-path a made-up Windows ref the source must refuse
  "%2e%2e/private.md",
];

/** What the adapter under test offers; the suite checks the adapter says the same. */
export interface KnowledgeProviderContractOptions {
  /** Whether it searches, so the search cases run. */
  search: boolean;
  /** Whether it has `list`, so the list cases run. */
  list: boolean;
}

/** The contract every {@link KnowledgeProvider} adapter passes: `get`, and `search` and `list` where it has them. */
export function knowledgeProviderContract(
  name: string,
  make: MakeKnowledgeProvider,
  options: KnowledgeProviderContractOptions,
): void {
  const makeSeeded = () => make({ docs: knowledgeDocs, outside: outsideFiles });
  verifies("contracts.knowledge-provider", () => {
    describe(`KnowledgeProvider contract: ${name}`, () => {
      capabilityCases(makeSeeded, options);
      getCases(makeSeeded);
      if (options.search) searchCases(make, makeSeeded);
      if (options.list) listCases(make, makeSeeded);
    });
  });
}

function capabilityCases(
  makeSeeded: () => Promise<KnowledgeProvider>,
  options: KnowledgeProviderContractOptions,
): void {
  it("names itself and says what it can do, as the binding declares", async () => {
    const provider = await makeSeeded();
    expect(provider.id).not.toBe("");
    expect(provider.capabilities.search).toBe(options.search);
    expect(typeof provider.list === "function").toBe(options.list);
    expect([undefined, true, false]).toContain(provider.untrusted);
  });

  it("offers semantic search only as a kind of search", async () => {
    const { search, semantic } = (await makeSeeded()).capabilities;
    expect(semantic && !search).toBe(false);
  });
}

function getCases(makeSeeded: () => Promise<KnowledgeProvider>): void {
  it("gives back every document with its ref, title and content", async () => {
    const provider = await makeSeeded();
    for (const doc of knowledgeDocs) {
      expect(await provider.get(doc.ref), doc.ref).toEqual(doc);
    }
  });

  it("gives null for a ref that names no document, and never reads outside the source", async () => {
    const provider = await makeSeeded();
    for (const ref of unknownKnowledgeRefs) {
      expect(await provider.get(ref), JSON.stringify(ref)).toBeNull();
    }
  });

  it("keeps its documents, whatever the caller does with what it got", async () => {
    const provider = await makeSeeded();
    const first = knowledgeDocs[0] as KnowledgeDoc;
    const got = (await provider.get(first.ref)) as KnowledgeDoc;
    got.content = "changed";
    got.title = "changed";
    expect(await provider.get(first.ref)).toEqual(first);
  });
}

function searchCases(
  make: MakeKnowledgeProvider,
  makeSeeded: () => Promise<KnowledgeProvider>,
): void {
  it("finds a document by a word only it has, first", async () => {
    const provider = await makeSeeded();
    const hits = await provider.search("bookkeeper");
    expect(hits[0]?.ref).toBe("guides/invoices.md");
    expect(hits[0]?.title).toBe("Invoices");
  });

  it("gives hits best first, each once, each a document it holds", async () => {
    const provider = await makeSeeded();
    // More words from the invoices guide than from the setup guide, so the two can't score the same.
    const hits = await provider.search("invoice invoices reminder bookkeeper kettle");
    const refs = hits.map((hit) => hit.ref);
    expect(refs[0]).toBe("guides/invoices.md");
    expect(new Set(refs).size).toBe(refs.length);
    for (const hit of hits) {
      expect(knowledgeDocs.map((doc) => doc.ref)).toContain(hit.ref);
      expect(typeof hit.snippet).toBe("string");
      expect(Number.isFinite(hit.score)).toBe(true);
    }
    const scores = hits.map((hit) => hit.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("gives at most `limit` hits", async () => {
    const provider = await makeSeeded();
    const all = await provider.search("invoice Studio Monday");
    expect(all.length).toBeGreaterThan(1);
    const one = await provider.search("invoice Studio Monday", { limit: 1 });
    expect(one).toHaveLength(1);
  });

  it("gives no hits for a limit below 1", async () => {
    const provider = await makeSeeded();
    expect(await provider.search("invoice Studio Monday", { limit: 0 })).toEqual([]);
    expect(await provider.search("invoice Studio Monday", { limit: -1 })).toEqual([]);
  });

  it("finds nothing outside the source, or in an empty one", async () => {
    const provider = await makeSeeded();
    // A semantic source may still give its nearest documents, so only check where hits come from.
    const heldRefs = knowledgeDocs.map((doc) => doc.ref);
    const hits = await provider.search("zanzibar");
    for (const hit of hits) {
      expect(heldRefs).toContain(hit.ref);
    }
    // A source that matches words, not meaning, finds nothing for a word none of its documents has.
    if (!provider.capabilities.semantic) expect(hits).toEqual([]);
    const empty = await make({ docs: [], outside: outsideFiles });
    expect(await empty.search("zanzibar invoice")).toEqual([]);
  });
}

function listCases(
  make: MakeKnowledgeProvider,
  makeSeeded: () => Promise<KnowledgeProvider>,
): void {
  it("lists every document's ref and title once, and nothing outside", async () => {
    const provider = await makeSeeded();
    const listed = (await provider.list?.()) ?? [];
    const byRef = (a: { ref: string }, b: { ref: string }) => (a.ref < b.ref ? -1 : 1);
    expect([...listed].sort(byRef)).toEqual(
      knowledgeDocs.map(({ ref, title }) => ({ ref, title })).sort(byRef),
    );
    const empty = await make({ docs: [], outside: outsideFiles });
    expect(await empty.list?.()).toEqual([]);
  });
}
