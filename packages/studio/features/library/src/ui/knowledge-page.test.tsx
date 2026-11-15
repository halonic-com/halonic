// @vitest-environment jsdom
import type { ItemUsage } from "@halonicjs/app";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type KnowledgeHost,
  KnowledgeHostService,
  type KnowledgeSource,
} from "../knowledge-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { KnowledgePage } from "./knowledge-page.tsx";

afterEach(unmountAll);

const text = "id: handbook\nname: Handbook\nsummary: Refund timing.\nprovider: files\n";
const nobody: ItemUsage = { agents: [], hubs: [], routines: [], collections: [] };

function setup(
  source: KnowledgeSource | undefined = { text, source: "Folder docs · 14 documents" },
  usage: ItemUsage = nobody,
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
  };
  const props = {
    item: { kind: "knowledge", hub: "~workspace", id: "handbook" },
    context: {
      services: {
        get: (key: unknown) => (key === KnowledgeHostService ? host : undefined),
        find: (key: unknown) => (key === KnowledgeHostService ? host : undefined),
      },
      announcer: { announceState: vi.fn() },
      openItem,
      openPlace,
    },
    Sections: () => null,
  } as unknown as ItemViewProps;
  return { props, write, openItem, openPlace };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((each) => each.textContent === label);
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
          services: {
            find: () => ({
              read: async () => undefined,
              write: async () => {},
              usage: async () => nobody,
              subscribe: () => () => {},
            }),
          },
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
