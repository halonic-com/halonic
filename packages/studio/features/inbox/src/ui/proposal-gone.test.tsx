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
  return {
    accept: unused,
    reject: unused,
    undo: unused,
    settle: unused,
    remove,
    compare: unused,
    choose: unused,
  };
}

function show(
  remove: ProposalDecisions["remove"],
  readAgain: () => Promise<void> = async () => {},
) {
  const onRemoved = vi.fn();
  const onChangesBack = vi.fn();
  const writeClipboard = vi.fn(async (_text: string) => true);
  const root = render(
    <ToastStoreProvider store={createToastStore()}>
      <ClipboardProvider writeClipboard={writeClipboard}>
        <GoneLine
          runId={runId}
          decisions={decisionsRemoving(remove)}
          onRemoved={onRemoved}
          readAgain={readAgain}
          onChangesBack={onChangesBack}
        />
      </ClipboardProvider>
    </ToastStoreProvider>,
  );
  return { root, onRemoved, onChangesBack, writeClipboard };
}

function button(root: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
}

async function press(target: HTMLButtonElement | undefined) {
  await act(async () => target?.click());
}

const alertOf = (root: HTMLElement) => root.querySelector('[role="alert"]')?.textContent;

const changesBack = () =>
  Promise.reject(
    new ProposalFailedError(
      "changes-back",
      "The proposal of run run_mfx3k2a1_0001JD8Q is still available.",
    ),
  );

verifies("inbox.proposal-page-states", () => {
  describe("a Remove from Inbox that fails", () => {
    it("says the engine isn't answering, and Remove from Inbox, the only button, tries again", async () => {
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
      expect(button(root, "Try again")).toBeUndefined();
      expect(root.querySelectorAll("button")).toHaveLength(1);
      await press(button(root, "Remove from Inbox"));
      expect(onRemoved).toHaveBeenCalledTimes(1);
      expect(alertOf(root)).toBeUndefined();
    });

    it("reads the proposal again when its changes are there again, so the page shows them", async () => {
      const readAgain = vi.fn(async () => {});
      const { root, onChangesBack } = show(changesBack, readAgain);
      await press(button(root, "Remove from Inbox"));

      expect(readAgain).toHaveBeenCalledTimes(1);
      expect(onChangesBack).toHaveBeenCalledTimes(1);
      expect(alertOf(root)).toBeUndefined();
    });

    it("says the changes are there again, with focus on that line, when they can't be read", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const { root, onChangesBack } = show(changesBack, () =>
        Promise.reject(new Error("The engine isn't answering.")),
      );
      await press(button(root, "Remove from Inbox"));

      expect(onChangesBack).not.toHaveBeenCalled();
      expect(alertOf(root)).toBe(
        "Couldn't remove this: run 01JD8Q's changes are there again. Review them instead.",
      );
      expect(document.activeElement).toBe(root.querySelector('[role="alert"]'));
      expect(root.textContent).not.toContain("still available");
      expect(root.querySelectorAll("button")).toHaveLength(0);
      expect(error).toHaveBeenCalledWith("Couldn't read the run proposal again", expect.any(Error));
      error.mockRestore();
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

  it("keeps the line at least 20 rem wide, so the button wraps under it rather than squeezing it", () => {
    const { root } = show(async () => {});
    const line = root.querySelector("p");

    expect(line?.className).toContain("basis-80");
    expect(line?.className).toContain("grow");
  });
});
