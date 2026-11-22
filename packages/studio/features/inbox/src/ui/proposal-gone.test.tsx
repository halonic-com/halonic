// @vitest-environment jsdom
import { ClipboardProvider, createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ProposalDecisions, ProposalFailedError } from "../proposal-decisions.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { GoneLine } from "./proposal-gone.tsx";

afterEach(() => {
  unmountAll();
});

const runId = "run_mfx3k2a1_0001JD8Q";

/** Decisions whose Remove does what `remove` does; the page calls nothing else here. */
function decisionsRemoving(remove: ProposalDecisions["remove"]): ProposalDecisions {
  const unused = () => Promise.reject(new Error("Not called on this line."));
  return { accept: unused, reject: unused, undo: unused, settle: unused, remove };
}

function show(remove: ProposalDecisions["remove"]) {
  const onRemoved = vi.fn();
  const writeClipboard = vi.fn(async (_text: string) => true);
  const root = render(
    <ToastStoreProvider store={createToastStore()}>
      <ClipboardProvider writeClipboard={writeClipboard}>
        <GoneLine runId={runId} decisions={decisionsRemoving(remove)} onRemoved={onRemoved} />
      </ClipboardProvider>
    </ToastStoreProvider>,
  );
  return { root, onRemoved, writeClipboard };
}

function button(root: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
}

async function press(target: HTMLButtonElement | undefined) {
  await act(async () => target?.click());
}

const alertOf = (root: HTMLElement) => root.querySelector('[role="alert"]')?.textContent;

verifies("inbox.proposal-page-states", () => {
  describe("a Remove from Inbox that fails", () => {
    it("says the engine isn't answering, with Try again, and Try again removes it", async () => {
      const remove = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new ProposalFailedError("not-answering", "host_unavailable"))
        .mockResolvedValueOnce(undefined);
      const { root, onRemoved } = show(remove);
      await press(button(root, "Remove from Inbox"));

      expect(alertOf(root)).toBe(
        "Couldn't remove this: the engine isn't answering. It may still be starting.",
      );
      expect(onRemoved).not.toHaveBeenCalled();
      await press(button(root, "Try again"));
      expect(onRemoved).toHaveBeenCalledTimes(1);
      expect(alertOf(root)).toBeUndefined();
    });

    it("says the changes are there again, and offers nothing to press", async () => {
      const refused = new ProposalFailedError(
        "changes-back",
        "The proposal of run run_mfx3k2a1_0001JD8Q is still available.",
      );
      const { root } = show(() => Promise.reject(refused));
      await press(button(root, "Remove from Inbox"));

      expect(alertOf(root)).toBe(
        "Couldn't remove this: run 01JD8Q's changes are there again. Review them instead.",
      );
      expect(root.textContent).not.toContain("still available");
      expect(root.querySelectorAll("button")).toHaveLength(0);
    });

    it("never shows the host's own text, which only Copy details puts on the clipboard", async () => {
      const failed = new ProposalFailedError("unexplained", "POST /v1/proposals/remove 500");
      const { root, writeClipboard } = show(() => Promise.reject(failed));
      await press(button(root, "Remove from Inbox"));

      expect(alertOf(root)).toBe(
        "Couldn't remove this: Halonic ran into a problem it can't explain yet.",
      );
      expect(root.textContent).not.toContain("/v1/proposals/remove");
      expect(button(root, "Try again")).toBeUndefined();
      await press(button(root, "Copy details"));
      expect(writeClipboard).toHaveBeenCalledWith(
        expect.stringContaining("POST /v1/proposals/remove 500"),
      );
    });

    it("calls a failure the app didn't sort one it can't explain", async () => {
      const { root } = show(() => Promise.reject(new Error("The window lost its host.")));
      await press(button(root, "Remove from Inbox"));

      expect(alertOf(root)).toBe(
        "Couldn't remove this: Halonic ran into a problem it can't explain yet.",
      );
      expect(button(root, "Remove from Inbox")).toBeDefined();
    });
  });
});
