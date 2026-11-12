// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import {
  deleteDialog,
  dialogOf,
  fakeDialogPage,
  newAgentDialog,
  restoreDialogPage,
} from "../test/dialogs.tsx";
import { render, unmountAll } from "../test/render.tsx";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
});

/** The elements the dialog's `aria-describedby` points at, in order. */
function descriptionsOf(dialog: HTMLDialogElement): (HTMLElement | null)[] {
  const ids = dialog.getAttribute("aria-describedby")?.split(" ") ?? [];
  return ids.map((id) => document.getElementById(id));
}

verifies("kit.dialog-footnote", () => {
  it("draws the line after the body and before the footer, outside the body's scroll area", () => {
    const dialog = dialogOf(render(deleteDialog({ footnote: "This can't be undone." })).container);
    const footnote = [...dialog.querySelectorAll("p")].find(
      (paragraph) => paragraph.textContent === "This can't be undone.",
    );
    expect(footnote).toBeDefined();
    expect(footnote?.className).toContain("px-6 pt-3 text-small text-fg-muted");
    const body = footnote?.previousElementSibling;
    expect(body?.className).toContain("overflow-y-auto");
    expect(body?.contains(dialog.querySelector('[role="alert"]'))).toBe(true);
    expect(footnote?.parentElement?.nextElementSibling?.tagName).toBe("FOOTER");
  });

  it("scrolls with the header and the body when the window is short", () => {
    const dialog = dialogOf(render(deleteDialog({ footnote: "This can't be undone." })).container);
    const footnote = [...dialog.querySelectorAll("p")].at(-1);
    expect(footnote?.parentElement?.className).toContain("short:overflow-y-auto");
    expect(footnote?.parentElement?.contains(dialog.querySelector("header"))).toBe(true);
  });

  it("describes the Dialog after the body", () => {
    const dialog = dialogOf(render(deleteDialog({ footnote: "This can't be undone." })).container);
    const [body, footnote] = descriptionsOf(dialog);
    expect(body?.textContent).toContain("Sorter and its history are deleted");
    expect(footnote?.textContent).toBe("This can't be undone.");
  });

  it("describes a form Dialog on its own, without the fields", () => {
    const dialog = dialogOf(
      render(newAgentDialog({ footnote: "You can rename it later." })).container,
    );
    const descriptions = descriptionsOf(dialog);
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0]?.textContent).toBe("You can rename it later.");
  });

  it("draws nothing and changes no description without a footnote", () => {
    const dialog = dialogOf(render(deleteDialog()).container);
    expect(descriptionsOf(dialog)).toHaveLength(1);
    expect(dialog.querySelector("p.text-small")).toBeNull();
  });

  it("is the ActionBar's muted note in a form sheet on a phone", () => {
    const { container } = render(
      <PresentationProvider presentation="phone">
        {newAgentDialog({ footnote: "You can rename it later." })}
      </PresentationProvider>,
    );
    const note = [...dialogOf(container).querySelectorAll(".action-bar p")].find(
      (paragraph) => paragraph.textContent === "You can rename it later.",
    );
    expect(note?.className).toContain("text-fg-muted");
  });
});
