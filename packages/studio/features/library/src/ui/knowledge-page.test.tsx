// @vitest-environment jsdom
import type { ItemUsage } from "@halonicjs/app";
import { type ItemViewProps, limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { libraryFeature } from "../feature.ts";
import {
  type KnowledgeHost,
  KnowledgeHostService,
  type KnowledgeSource,
  type SummarizeOutcome,
} from "../knowledge-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { KnowledgePage } from "./knowledge-page.tsx";

afterEach(unmountAll);

const text = "id: handbook\nname: Handbook\nsummary: Refund timing.\nprovider: files\n";
const nobody: ItemUsage = { agents: [], hubs: [], routines: [], collections: [] };

function setup(
  source: KnowledgeSource | undefined = { text, source: "Folder docs · 14 documents" },
  usage: ItemUsage = nobody,
  outcome: SummarizeOutcome | Error = { kind: "drafted", text: "Draft of the handbook." },
) {
  let current = source;
  const write = vi.fn(async (_ref: unknown, next: string) => {
    if (current !== undefined) current = { ...current, text: next };
  });
  const openItem = vi.fn();
  const openPlace = vi.fn();
  const host: KnowledgeHost = {
    read: async () => current,
    write,
    usage: async () => usage,
    subscribe: () => () => {},
    summarize: async () => {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
  const runCommand = vi.fn(() => true);
  const announceState = vi.fn();
  const props = {
    item: { kind: "knowledge", hub: "~workspace", id: "handbook" },
    context: {
      services: limitedLookup(libraryFeature, {
        get: (key: unknown) => (key === KnowledgeHostService ? host : undefined),
        find: (key: unknown) => (key === KnowledgeHostService ? host : undefined),
      }),
      announcer: { announceState },
      openItem,
      openPlace,
      runCommand,
    },
    Sections: () => null,
  } as unknown as ItemViewProps;
  return { props, write, openItem, openPlace, runCommand, announceState };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  // Summarize holds both its label and "Summarizing…" so its width doesn't change while busy.
  const found = [...root.querySelectorAll("button")].find(
    (each) =>
      each.textContent === label ||
      (label === "Summarize" && each.textContent === "SummarizeSummarizing…"),
  );
  if (found === undefined) throw new Error(`No button ${label}`);
  return found;
}

function radio(root: HTMLElement, label: string): HTMLInputElement {
  const found = [...root.querySelectorAll("label")].find((each) =>
    each.textContent?.includes(label),
  );
  const input = found?.querySelector("input") ?? null;
  if (input === null) throw new Error(`No option ${label}`);
  return input;
}

const tools = "Agents search when they decide to (tools)";
const auto = "Also search with the task before the first model call (auto)";

verifies("library.knowledge-page", () => {
  describe("KnowledgePage", () => {
    it("shows the source, the summary, the picked mode and who uses it", async () => {
      const usage = { ...nobody, agents: [{ id: "support", name: "Support", hub: null }] };
      const { props, openItem } = setup(undefined, usage);
      const root = render(<KnowledgePage {...props} />);
      await settled();
      expect(root.querySelector("h1")?.textContent).toBe("Handbook");
      expect(root.textContent).toContain("Folder docs · 14 documents");
      expect(root.textContent).toContain("Refund timing.");
      expect(radio(root, tools).checked).toBe(true);
      expect(radio(root, auto).checked).toBe(false);
      expect(root.querySelector("input[type=text]")).toBeNull();
      act(() => button(root, "Support").click());
      expect(openItem).toHaveBeenCalledWith({ kind: "agent", hub: "~workspace", id: "support" });
    });

    it("says what is missing: no summary, nobody using it, no notes line", async () => {
      const { props } = setup({ text: "id: handbook\nprovider: files\n", source: "Folder docs" });
      const root = render(<KnowledgePage {...props} />);
      await settled();
      expect(root.textContent).toContain("No summary yet.");
      expect(root.textContent).toContain("No agent uses this source yet.");
      expect(root.textContent).not.toContain("Agents keep notes here.");
      expect(root.textContent).not.toContain("Remove summary");
    });

    it("says agents keep notes in a writable source", async () => {
      const { props } = setup({
        text: "id: handbook\nprovider: files\nwritable: true\n",
        source: "Folder docs",
      });
      const root = render(<KnowledgePage {...props} />);
      await settled();
      expect(root.textContent).toContain(
        "Agents keep notes here. They show on each agent's Memory page.",
      );
    });

    it("writes mode: auto at once when the second option is picked", async () => {
      const { props, write } = setup();
      const root = render(<KnowledgePage {...props} />);
      await settled();
      await act(async () => radio(root, auto).click());
      await settled();
      expect(write).toHaveBeenCalledOnce();
      expect(write).toHaveBeenCalledWith({ hub: null, id: "handbook" }, `${text}mode: auto\n`);
      expect(radio(root, auto).checked).toBe(true);
    });

    it("says a save failed and saves the change again on Try again", async () => {
      const { props, write } = setup();
      write.mockRejectedValueOnce(Object.assign(new Error("The disk is full."), { kind: "unavailable" }));
      vi.spyOn(console, "error").mockImplementation(() => {});
      const root = render(<KnowledgePage {...props} />);
      await settled();
      await act(async () => radio(root, auto).click());
      await settled();
      expect(root.textContent).toContain("Couldn't save the knowledge source");
      expect(root.textContent).toContain("The disk is full.");
      expect(console.error).toHaveBeenCalled();
      await act(async () => button(root, "Try again").click());
      await settled();
      expect(write).toHaveBeenCalledTimes(2);
      expect(root.textContent).not.toContain("Couldn't save the knowledge source");
      expect(radio(root, auto).checked).toBe(true);
    });

    it("blames an unreachable host, not the model, when Summarize throws unavailable", async () => {
      const { props } = setup(
        undefined,
        nobody,
        Object.assign(new Error("down"), { kind: "unavailable" }),
      );
      vi.spyOn(console, "error").mockImplementation(() => {});
      const root = render(<KnowledgePage {...props} />);
      await settled();
      await act(async () => button(root, "Summarize").click());
      await settled();
      expect(root.textContent).toContain(
        "Couldn't summarize Handbook: Halonic on your computer isn't answering.",
      );
    });

    it("removes mode when the first option is picked", async () => {
      const { props, write } = setup({ text: `${text}mode: auto\n`, source: "Folder docs" });
      const root = render(<KnowledgePage {...props} />);
      await settled();
      await act(async () => radio(root, tools).click());
      await settled();
      expect(write).toHaveBeenCalledWith({ hub: null, id: "handbook" }, text);
    });

    it("removes the summary", async () => {
      const { props, write } = setup();
      const root = render(<KnowledgePage {...props} />);
      await settled();
      await act(async () => button(root, "Remove summary").click());
      await settled();
      expect(write).toHaveBeenCalledWith(
        { hub: null, id: "handbook" },
        "id: handbook\nname: Handbook\nprovider: files\n",
      );
      expect(root.textContent).toContain("No summary yet.");
    });

    it("says the source isn't in the workspace when the host has none", async () => {
      const { props, openPlace } = setup();
      const missing = {
        ...props,
        context: {
          ...props.context,
          services: limitedLookup(libraryFeature, {
            get: () => undefined,
            find: () => ({
              read: async () => undefined,
              write: async () => {},
              usage: async () => nobody,
              subscribe: () => () => {},
              summarize: async () => ({ kind: "no-documents" }),
            }),
          }),
        },
      } as unknown as ItemViewProps;
      const root = render(<KnowledgePage {...missing} />);
      await settled();
      expect(root.textContent).toContain("This knowledge source isn't in this workspace any more.");
      act(() => root.querySelector("button")?.click());
      expect(openPlace).toHaveBeenCalledWith("library");
    });
  });
});

verifies("library.knowledge-summarize", () => {
  describe("KnowledgePage Summarize", () => {
    it("drafts nothing until Summarize is asked, then shows an editable draft", async () => {
      const { props, write, announceState } = setup();
      const root = render(<KnowledgePage {...props} />);
      await settled();
      expect(root.textContent).not.toContain("Draft summary");
      await act(async () => button(root, "Summarize").click());
      await settled();
      const draft = root.querySelector("textarea");
      expect(draft?.value).toBe("Draft of the handbook.");
      expect(document.activeElement).toBe(draft);
      expect(announceState).toHaveBeenCalledWith(
        "knowledge-summary",
        "Draft summary ready. Use this summary or Discard.",
      );
      expect(write).not.toHaveBeenCalled();
    });

    it("saves the draft as the summary and returns focus to Summarize", async () => {
      const { props, write } = setup();
      const root = render(<KnowledgePage {...props} />);
      await settled();
      await act(async () => button(root, "Summarize").click());
      await settled();
      await act(async () => button(root, "Use this summary").click());
      await settled();
      expect(write).toHaveBeenCalledWith(
        { hub: null, id: "handbook" },
        "id: handbook\nname: Handbook\nsummary: Draft of the handbook.\nprovider: files\n",
      );
      expect(root.querySelector("textarea")).toBeNull();
      expect(document.activeElement).toBe(button(root, "Summarize"));
    });

    it("discards the draft without writing", async () => {
      const { props, write } = setup();
      const root = render(<KnowledgePage {...props} />);
      await settled();
      await act(async () => button(root, "Summarize").click());
      await settled();
      await act(async () => button(root, "Discard").click());
      await settled();
      expect(write).not.toHaveBeenCalled();
      expect(root.querySelector("textarea")).toBeNull();
      expect(root.textContent).toContain("Refund timing.");
      expect(document.activeElement).toBe(button(root, "Summarize"));
    });

    it("says a local model is needed, with a link to Models", async () => {
      const { props, runCommand } = setup(undefined, nobody, { kind: "no-local-model" });
      const root = render(<KnowledgePage {...props} />);
      await settled();
      await act(async () => button(root, "Summarize").click());
      await settled();
      expect(root.textContent).toContain(
        "Summarize uses a local model, and the default model alias has none.",
      );
      await act(async () => button(root, "Models ›").click());
      expect(runCommand).toHaveBeenCalledWith("workspace.open-models");
    });

    it("says there is nothing to summarize, or that it failed, under the row", async () => {
      const none = setup(undefined, nobody, { kind: "no-documents" });
      const first = render(<KnowledgePage {...none.props} />);
      await settled();
      await act(async () => button(first, "Summarize").click());
      await settled();
      expect(first.textContent).toContain(
        "Handbook has no documents to summarize, or Halonic can't list them.",
      );
      vi.spyOn(console, "error").mockImplementation(() => {});
      const broken = setup(undefined, nobody, new Error("boom"));
      const second = render(<KnowledgePage {...broken.props} />);
      await settled();
      await act(async () => button(second, "Summarize").click());
      await settled();
      expect(second.textContent).toContain(
        "Couldn't summarize Handbook: the local model didn't answer.",
      );
      expect(second.textContent).not.toContain("boom");
      expect(button(second, "Try again")).toBeDefined();
    });

    it.each([
      [
        "host-unreachable",
        "Couldn't summarize Handbook: Halonic on your computer isn't answering.",
      ],
      ["too-large", "Couldn't summarize Handbook: it has more text than one summary can take."],
    ] as const)("gives a reason when Summarize ends with %s", async (kind, line) => {
      const { props } = setup(undefined, nobody, { kind });
      const root = render(<KnowledgePage {...props} />);
      await settled();
      await act(async () => button(root, "Summarize").click());
      await settled();
      expect(root.textContent).toContain(line);
    });
  });
});
