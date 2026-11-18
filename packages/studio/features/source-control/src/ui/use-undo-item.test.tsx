// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangeItem } from "../change-items.ts";
import { ChangesList } from "../changes-list.ts";
import type { ChangedFile } from "../changes-list-state.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { type UndoItem, useUndoItem } from "./use-undo-item.ts";

afterEach(unmountAll);

const file = { path: "agents/sorter.agent.yaml" } as ChangedFile;
const item = {
  id: "agent:sorter",
  name: "Sorter",
  itemId: "sorter",
  kind: "agent",
  hub: "",
  files: [file],
  sentence: "",
} as ChangeItem;

verifies("source-control.discard", () => {
  describe("useUndoItem", () => {
    it("ignores a second Undo these changes while the first one runs", async () => {
      const list = new ChangesList(fakeSource({ kind: "ready", changes: [] }).source);
      let finish: () => void = () => undefined;
      const discardFile = vi.spyOn(list, "discardFile").mockImplementation(
        () =>
          new Promise((done) => {
            finish = () => done({ kind: "undone", undo: async () => undefined });
          }),
      );
      let undoing: UndoItem | undefined;
      function Probe() {
        undoing = useUndoItem(list);
        return null;
      }
      render(
        <ToastStoreProvider store={createToastStore()}>
          <Probe />
        </ToastStoreProvider>,
      );
      let first: Promise<void> = Promise.resolve();
      await act(async () => {
        first = undoing?.undo(item) ?? first;
        await undoing?.undo(item);
      });
      expect(discardFile).toHaveBeenCalledTimes(1);
      await act(async () => {
        finish();
        await first;
        await settle();
      });
      expect(undoing?.busy).toBe(false);
    });
  });
});
