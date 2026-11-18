// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MenuEntry } from "../menu/menu.tsx";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { dialogOf, fire } from "../test/dialogs.tsx";
import { fakeModal, restoreModal } from "../test/modal.ts";
import { render, unmountAll } from "../test/render.tsx";
import { HeaderBadgeWindowSheet } from "./header-badge-window-sheet.tsx";

let showModal: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fakeModal();
  showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
});

afterEach(() => {
  unmountAll();
  showModal.mockRestore();
  restoreModal();
});

const entries: readonly MenuEntry[] = [
  { id: "beta", label: "Beta", onSelect: vi.fn() },
  { id: "close", label: "Close workspace", onSelect: vi.fn() },
];

/**
 * More's workspace row, with the sheet it opens when `open`. In strict mode, as the Studio mounts
 * its window, so effects that run twice can't lose what opened the sheet.
 */
function More({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  return (
    <StrictMode>
      <PresentationProvider presentation="phone">
        <h1 tabIndex={-1}>More</h1>
        <button type="button">Workspace: Acme. Change workspace</button>
        {open ? (
          <HeaderBadgeWindowSheet title="Workspace" entries={entries} onClose={onClose} />
        ) : null}
      </PresentationProvider>
    </StrictMode>
  );
}

function openSheet(onClose = vi.fn()) {
  const rendered = render(<More open={false} onClose={onClose} />);
  const row = rendered.container.querySelector("button") as HTMLButtonElement;
  row.focus();
  rendered.rerender(<More open onClose={onClose} />);
  return { ...rendered, row, dialog: dialogOf(rendered.container) };
}

verifies("kit.header-badge-window-sheet", () => {
  it("opens as a modal dialog named after its title, with focus on the title", () => {
    const { dialog } = openSheet();

    // A modal dialog makes the page under it inert, so Tab and Shift+Tab stay in the sheet.
    // Strict mode opens it, closes it and opens it again.
    expect(showModal).toHaveBeenCalled();
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute("aria-label")).toBe("Workspace");
    expect(document.activeElement).toBe(dialog.querySelector("h2"));
    expect(dialog.querySelector("h2")?.textContent).toBe("Workspace");
  });

  it("calls onClose on Escape, as Back does, and stops the browser's own close", () => {
    const onClose = vi.fn();
    const { dialog } = openSheet(onClose);

    const escapeKey = fire(dialog, new Event("cancel", { cancelable: true }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(escapeKey.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(true);
  });

  it("moves focus back to what opened it on close", () => {
    const onClose = vi.fn();
    const { container, rerender, row } = openSheet(onClose);

    rerender(<More open={false} onClose={onClose} />);

    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(row);
  });
});
