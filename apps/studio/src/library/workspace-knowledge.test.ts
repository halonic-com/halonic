import type { ChatRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceKnowledge } from "./workspace-knowledge.ts";

const ollama = "id: ollama\ntype: ollama\n";
const models = (provider: string) =>
  `aliases:\n  default:\n    provider: ${provider}\n    model: llama3\n`;

function setup(extra: Record<string, string> = {}, chatError?: Error) {
  const store: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "models.yaml": models("ollama"),
    "providers/ollama.yaml": ollama,
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/library/knowledge/handbook.yaml":
      "id: handbook\nprovider: files\nconfig:\n  path: docs\n",
    "hubs/support/agents/helper.agent.yaml":
      "id: helper\nname: Helper\nknowledge: [handbook]\nmodel: default\n",
    "library/knowledge/faq.yaml": "id: faq\nprovider: mcp\nconfig: {}\n",
    "docs/refunds.md": "Refunds take five days.\n",
    "docs/shipping.txt": "We ship on Monday.\n",
    "docs/logo.png": "binary",
    ...extra,
  };
  const changes: Array<[string, Record<string, string | null>]> = [];
  const listeners = new Set<() => void>();
  const asked: Array<[string, ChatRequest]> = [];
  const host = new WorkspaceKnowledge({
    files: {
      read: async (path) => store[path] ?? null,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
      change: (label, made) => changes.push([label, made]),
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    chat: async (provider, request) => {
      asked.push([provider, request]);
      if (chatError) throw chatError;
      return {
        content: " Refund and shipping rules. ",
        toolCalls: [],
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: "stop",
      } as never;
    },
  });
  return { host, changes, listeners, asked };
}

const handbook = { hub: "support", id: "handbook" } as const;

verifies("studio.workspace-knowledge", () => {
  it("reads the file's text and counts the documents of a files source", async () => {
    const { host } = setup();
    const source = await host.read(handbook);
    expect(source?.text).toContain("id: handbook");
    expect(source?.source).toBe("Folder docs · 2 documents");
  });

  it("says one document in the singular, names another provider, and finds no missing source", async () => {
    const { host } = setup({
      "hubs/support/library/knowledge/solo.yaml":
        "id: solo\nprovider: files\nconfig:\n  path: solo\n",
      "solo/a.md": "One.\n",
    });
    expect((await host.read({ hub: "support", id: "solo" }))?.source).toBe(
      "Folder solo · 1 document",
    );
    expect((await host.read({ hub: null, id: "faq" }))?.source).toBe("mcp");
    expect(await host.read({ hub: null, id: "nope" })).toBeUndefined();
  });

  it("writes the file as one change, not a save", async () => {
    const { host, changes } = setup();
    await host.write({ hub: null, id: "faq" }, "new");
    expect(changes).toEqual([["Edited knowledge faq", { "library/knowledge/faq.yaml": "new" }]]);
  });

  it("says which agents use the source", async () => {
    const { host } = setup();
    expect((await host.usage(handbook)).agents.map((agent) => agent.id)).toEqual(["helper"]);
  });

  it("drafts a summary from the documents with a local model and saves nothing", async () => {
    const { host, asked, changes } = setup();
    expect(await host.summarize(handbook)).toEqual({
      kind: "drafted",
      text: "Refund and shipping rules.",
    });
    expect(asked[0]?.[0]).toBe("ollama");
    expect(asked[0]?.[1].model).toBe("llama3");
    const prompt = JSON.stringify(asked[0]?.[1].messages);
    expect(prompt).toContain("Refunds take five days.");
    expect(prompt).toContain("We ship on Monday.");
    expect(prompt).not.toContain("binary");
    expect(changes).toEqual([]);
  });

  it("calls no model when the default alias's provider is not on this machine", async () => {
    const { host, asked } = setup({
      "models.yaml": models("cloud"),
      "providers/cloud.yaml": "id: cloud\ntype: openai\n",
    });
    expect(await host.summarize(handbook)).toEqual({ kind: "no-local-model" });
    expect(asked).toEqual([]);
  });

  it("says there is no local model when the alias is missing", async () => {
    const { host } = setup({ "models.yaml": "aliases: {}\n" });
    expect(await host.summarize(handbook)).toEqual({ kind: "no-local-model" });
  });

  it("says there are no documents for a source with none, or of another provider", async () => {
    const empty = setup({ "docs/refunds.md": "", "docs/shipping.txt": "" });
    expect(await empty.host.summarize(handbook)).toEqual({ kind: "no-documents" });
    expect(await setup().host.summarize({ hub: null, id: "faq" })).toEqual({
      kind: "no-documents",
    });
    expect(empty.asked).toEqual([]);
  });

  it("rejects when the model fails", async () => {
    const { host } = setup({}, new Error("down"));
    await expect(host.summarize(handbook)).rejects.toThrow("down");
  });

  it("tells a listener when files change, until it stops", () => {
    const { host, listeners } = setup();
    const stop = host.subscribe(() => undefined);
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
  });
});
