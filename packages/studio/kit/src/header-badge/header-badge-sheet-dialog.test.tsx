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

/** The name the dialog's `aria-labelledby` gives it: the words of the element it points to. */
function nameOf(dialog: HTMLDialogElement): string | undefined {
  const id = dialog.getAttribute("aria-labelledby") ?? "";
  return document.getElementById(id)?.textContent ?? undefined;
}

verifies("kit.header-badge-sheet-dialog", () => {
  it("opens the sheet as a modal dialog named by its title, with focus on the title", () => {
    const { showModal, dialog } = openSheet();

    expect(showModal.mock.contexts).toEqual([dialog]);
    expect(dialog.open).toBe(true);
    expect(nameOf(dialog)).toBe("Workspace");
    expect(dialog.querySelector("li > button")?.textContent).toContain("Beta");
    expect(document.activeElement?.textContent).toBe("Workspace");
    expect(document.activeElement?.tagName).toBe("H2");
  });

  it("names the dialog once: by its title, with no landmark inside it", () => {
    const { dialog } = openSheet();

    expect(dialog.hasAttribute("aria-label")).toBe(false);
    expect(dialog.getAttribute("aria-labelledby")).toBe(dialog.querySelector("h2")?.id);
    expect(
      dialog.querySelector(
        "aside, header, footer, section, nav, [role='complementary'], [role='region'], [role='banner'], [role='contentinfo']",
      ),
    ).toBeNull();
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
