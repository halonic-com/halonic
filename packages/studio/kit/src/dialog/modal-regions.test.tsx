// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deleteDialog, fakeDialogPage, restoreDialogPage } from "../test/dialogs.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { Dialog } from "./dialog.tsx";
import { type ModalLiveRegions, ModalRegionsProvider } from "./modal-regions.tsx";

beforeEach(() => {
  fakeDialogPage();
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
  vi.useRealTimers();
});

/** A stand-in for the shell's announcer: a stack of regions, the topmost last. */
function fakeAnnouncer() {
  const stack: ModalLiveRegions[] = [];
  const push = (regions: ModalLiveRegions) => {
    stack.push(regions);
    return () => {
      stack.splice(stack.indexOf(regions), 1);
    };
  };
  return { stack, push };
}

function withAnnouncer(push: (regions: ModalLiveRegions) => () => void, children: ReactNode) {
  return <ModalRegionsProvider pushModalRegions={push}>{children}</ModalRegionsProvider>;
}

function regionsOf(dialog: Element | null) {
  return {
    polite: dialog?.querySelector(':scope > [aria-live="polite"]') as HTMLElement,
    assertive: dialog?.querySelector(':scope > [aria-live="assertive"]') as HTMLElement,
  };
}

verifies("kit.dialog-live-regions", () => {
  it("has a visually hidden polite and assertive region inside the dialog, with no role", () => {
    const { container } = render(deleteDialog());
    const { polite, assertive } = regionsOf(container.querySelector("dialog"));
    for (const region of [polite, assertive]) {
      expect(region.className).toBe("sr-only");
      expect(region.hasAttribute("role")).toBe(false);
      expect(region.textContent).toBe("");
    }
  });

  it("gives both regions to the announcer while open and takes them back on close", () => {
    const announcer = fakeAnnouncer();
    const { rerender } = render(withAnnouncer(announcer.push, deleteDialog()));
    expect(announcer.stack).toHaveLength(1);
    rerender(withAnnouncer(announcer.push, null));
    expect(announcer.stack).toHaveLength(0);
  });

  it("clears a region and writes the text on the next frame, so a repeat is read again", () => {
    const announcer = fakeAnnouncer();
    const { container } = render(withAnnouncer(announcer.push, deleteDialog()));
    const { polite, assertive } = regionsOf(container.querySelector("dialog"));
    const regions = announcer.stack[0] as ModalLiveRegions;

    act(() => regions.polite.say("Removed trust from inbox-helper"));
    act(() => vi.advanceTimersToNextFrame());
    expect(polite.textContent).toBe("Removed trust from inbox-helper");

    act(() => regions.polite.say("Removed trust from inbox-helper"));
    expect(polite.textContent).toBe("");
    act(() => vi.advanceTimersToNextFrame());
    expect(polite.textContent).toBe("Removed trust from inbox-helper");

    act(() => regions.assertive.say("Couldn't remove trust."));
    act(() => vi.advanceTimersToNextFrame());
    expect(assertive.textContent).toBe("Couldn't remove trust.");
  });

  it("puts a dialog over a dialog on top, and the one below back on top when it closes", () => {
    const announcer = fakeAnnouncer();
    const settings = deleteDialog({ title: "Settings" });
    const { container, rerender } = render(withAnnouncer(announcer.push, settings));
    const [outer] = container.querySelectorAll("dialog");
    rerender(
      withAnnouncer(
        announcer.push,
        <>
          {settings}
          {deleteDialog()}
        </>,
      ),
    );
    expect(announcer.stack).toHaveLength(2);
    rerender(withAnnouncer(announcer.push, settings));
    expect(announcer.stack).toHaveLength(1);
    act(() => announcer.stack[0]?.polite.say("Saved"));
    act(() => vi.advanceTimersToNextFrame());
    expect(regionsOf(outer ?? null).polite.textContent).toBe("Saved");
  });

  it("drops a text still waiting for its frame when the dialog closes", () => {
    const announcer = fakeAnnouncer();
    const { container, rerender } = render(withAnnouncer(announcer.push, deleteDialog()));
    const { polite } = regionsOf(container.querySelector("dialog"));
    act(() => announcer.stack[0]?.polite.say("Removed trust from inbox-helper"));
    rerender(withAnnouncer(announcer.push, null));
    act(() => vi.advanceTimersToNextFrame());
    expect(polite.textContent).toBe("");
  });

  it("keeps a text waiting for its frame when the shell re-renders with a new push", () => {
    const announcer = fakeAnnouncer();
    const inline = () => (regions: ModalLiveRegions) => announcer.push(regions);
    const { container, rerender } = render(withAnnouncer(inline(), deleteDialog()));
    const { polite } = regionsOf(container.querySelector("dialog"));
    act(() => announcer.stack[0]?.polite.say("Removed trust from inbox-helper"));
    rerender(withAnnouncer(inline(), deleteDialog()));
    act(() => vi.advanceTimersToNextFrame());
    expect(announcer.stack).toHaveLength(1);
    expect(polite.textContent).toBe("Removed trust from inbox-helper");
  });

  it("keeps a confirmation opened inside Settings on top when the shell re-renders", () => {
    const announcer = fakeAnnouncer();
    const inline = () => (regions: ModalLiveRegions) => announcer.push(regions);
    const settings = (body: ReactNode) => (
      <Dialog
        title="Settings"
        confirm={{ label: "Save" }}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      >
        {body}
      </Dialog>
    );
    const { container, rerender } = render(withAnnouncer(inline(), settings(null)));
    rerender(withAnnouncer(inline(), settings(deleteDialog())));
    rerender(withAnnouncer(inline(), settings(deleteDialog())));
    const [outer, inner] = container.querySelectorAll("dialog");
    act(() => announcer.stack.at(-1)?.polite.say("Saved"));
    act(() => vi.advanceTimersToNextFrame());
    expect(regionsOf(inner ?? null).polite.textContent).toBe("Saved");
    expect(regionsOf(outer ?? null).polite.textContent).toBe("");
  });

  it("works without an announcer, its regions staying empty", () => {
    const { container } = render(deleteDialog());
    expect(regionsOf(container.querySelector("dialog")).polite).not.toBeNull();
  });
});
