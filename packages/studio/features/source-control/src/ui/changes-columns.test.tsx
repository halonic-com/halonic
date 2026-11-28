// @vitest-environment jsdom

import type { VcsChange } from "@halonicjs/ports";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { UpdateMerge } from "../api.ts";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { openItem } from "../test-support/open-item.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

afterEach(unmountAll);

const lines = (...all: string[]) => `${all.join("\n")}\n`;
const agentPath = "agents/triage.agent.yaml";
const agentChange: VcsChange = { path: agentPath, status: "modified", staged: false };
const readmeChange: VcsChange = { path: "README.md", status: "modified", staged: false };

async function openPage(
  changes: readonly VcsChange[],
  options: { readonly phone?: boolean; readonly left?: UpdateMerge } = {},
) {
  const { phone = false, left } = options;
  const fake = fakeSource({ kind: "ready", changes });
  if (left !== undefined) {
    fake.setRemote(true);
    fake.setMerge(left);
  }
  fake.setTexts(agentPath, {
    before: lines("id: triage", "name: Triage", "model: claude"),
    after: lines("id: triage", "name: Triage", "model: gpt"),
  });
  fake.setTexts("README.md", { before: "a\n", after: "b\n" });
  const list = new ChangesList(fake.source);
  const view = <ChangesView list={list} />;
  const root = render(
    <ToastStoreProvider store={createToastStore()}>
      {phone ? <PresentationProvider presentation="phone">{view}</PresentationProvider> : view}
    </ToastStoreProvider>,
  );
  await act(settle);
  return { fake, root };
}

const pane = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-pane="content"]');
const listColumn = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-pane="list"]');

verifies("source-control.list-column", () => {
  describe("Changes in a list column beside a content pane", () => {
    it("puts the list in the kit's list column and says how many items changed in the pane", async () => {
      const { root } = await openPage([agentChange, readmeChange]);
      expect(listColumn(root)?.className).toContain("w-[34%]");
      expect(listColumn(root)?.className).toContain("overflow-y-auto");
      expect(listColumn(root)?.textContent).toContain("Since your last version");
      expect(pane(root)?.querySelector("h2")?.textContent).toBe("Changes");
      expect(pane(root)?.textContent).toContain("2 changes");
    });

    it("says nothing changed in the pane when no file changed", async () => {
      const { root } = await openPage([]);
      expect(pane(root)?.textContent).toContain("Nothing has changed since your last version.");
    });

    it("opens a row's What changed in the pane, keeps the list and marks the row current", async () => {
      const { root } = await openPage([agentChange, readmeChange]);
      openItem(root, "Triage");
      expect(pane(root)?.querySelector("h2")?.textContent).toBe("Triage");
      expect(document.activeElement?.textContent).toBe("Triage");
      const current = listColumn(root)?.querySelector('[aria-current="true"]');
      expect(current?.textContent).toContain("Triage");
      openItem(root, "README.md");
      expect(pane(root)?.querySelector("h2")?.textContent).toBe("README.md");
      expect(document.activeElement?.textContent).toBe("README.md");
    });

    it("empties the pane and puts focus on the row that took the place of an item undone", async () => {
      const { fake, root } = await openPage([agentChange, readmeChange]);
      const page = openItem(root, "Triage");
      fake.answer({ kind: "ready", changes: [readmeChange] });
      const undo = [...page.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Undo these changes",
      );
      await act(async () => {
        undo?.click();
        await settle();
      });
      expect(pane(root)?.querySelector("h2")?.textContent).toBe("Changes");
      expect(document.activeElement?.closest('[data-pane="list"]')).not.toBeNull();
      expect(document.activeElement?.textContent).toContain("README.md");
    });

    it("shows Get updates' choices in the pane", async () => {
      const { root } = await openPage([agentChange], {
        left: {
          items: [{ path: "x.md", mine: "a\n", theirs: "b\n", choice: undefined, copy: undefined }],
          versions: 2,
          people: ["Sam"],
        },
      });
      const resume = [...root.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Continue",
      );
      await act(async () => {
        resume?.click();
        await settle();
      });
      expect(pane(root)?.textContent).toContain("Keep mine");
      expect(listColumn(root)?.textContent).not.toContain("Keep mine");
    });

    it("shows the list alone on a phone", async () => {
      const { root } = await openPage([agentChange], { phone: true });
      expect(pane(root)).toBeNull();
      expect(root.textContent).toContain("Since your last version");
    });
  });
});
