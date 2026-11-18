// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { fakeModal, restoreModal } from "../test/modal.ts";
import { render, unmountAll } from "../test/render.tsx";
import { HeaderBadgeSheetDialog } from "./header-badge-sheet-dialog.tsx";

beforeEach(() => {
  fakeModal();
});

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  restoreModal();
  for (const opener of openers.splice(0)) opener.remove();
});

const openers: HTMLButtonElement[] = [];

/** The opener "Workspace: Acme", focused, and a render of its sheet that a test can take away. */
function openSheet(onClose: () => void = vi.fn()) {
  const opener = document.createElement("button");
  opener.textContent = "Workspace: Acme";
  document.body.append(opener);
  openers.push(opener);
  opener.focus();
  const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
  const rows = [{ id: "beta", label: "Beta", onSelect: vi.fn() }];
  const { container, rerender } = render(
    <PresentationProvider presentation="phone">
      <HeaderBadgeSheetDialog title="Workspace" entries={rows} onClose={onClose} />
    </PresentationProvider>,
  );
  const dialog = container.querySelector("dialog") as HTMLDialogElement;
  const close = () =>
    rerender(<PresentationProvider presentation="phone">{null}</PresentationProvider>);
  return { opener, showModal, dialog, close };
}

verifies("kit.header-badge-sheet-dialog", () => {
  it("opens the sheet as a modal dialog named by its title, with focus on the title", () => {
    const { showModal, dialog } = openSheet();

    expect(showModal.mock.contexts).toEqual([dialog]);
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute("aria-label")).toBe("Workspace");
    expect(dialog.querySelector("li > button")?.textContent).toContain("Beta");
    expect(document.activeElement?.textContent).toBe("Workspace");
    expect(document.activeElement?.tagName).toBe("H2");
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    const { dialog } = openSheet(onClose);

    act(() => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("gives focus back to the opener when it closes", () => {
    const { opener, close } = openSheet();

    close();

    expect(document.activeElement).toBe(opener);
  });
});
