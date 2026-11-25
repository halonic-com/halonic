// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { standaloneLinkClasses } from "../external-link/external-link.tsx";
import {
  buttonNamed,
  deleteDialog,
  dialogOf,
  fakeDialogPage,
  restoreDialogPage,
} from "../test/dialogs.tsx";
import { click, render, unmountAll } from "../test/render.tsx";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
});

const describeLink = "Describe it instead ›";

/** The names of the footer's buttons, in order. */
function footerButtons(container: HTMLElement): string[] {
  const footer = dialogOf(container).querySelector("footer");
  return [...(footer?.querySelectorAll("button") ?? [])].map((button) => button.textContent ?? "");
}

verifies("kit.dialog-start-link", () => {
  it("sits at the start of the footer as a link, across from Cancel and the confirming button", () => {
    const { container } = render(
      deleteDialog({ startLink: { label: describeLink, onClick: () => undefined } }),
    );
    expect(footerButtons(container)).toEqual([describeLink, "Cancel", "Delete agentDeleting…"]);
    const link = buttonNamed(container, describeLink);
    expect(link?.className).toContain(standaloneLinkClasses);
    expect(link?.className).toContain("me-auto");
  });

  it("runs its own onClick, not onConfirm", async () => {
    const onClick = vi.fn();
    const onConfirm = vi.fn();
    const { container } = render(
      deleteDialog({ startLink: { label: describeLink, onClick }, onConfirm }),
    );
    await click(buttonNamed(container, describeLink));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does nothing while the Dialog is busy", async () => {
    const onClick = vi.fn();
    const { container } = render(
      deleteDialog({ startLink: { label: describeLink, onClick }, busy: true }),
    );
    await click(buttonNamed(container, describeLink));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is left out when there is none", () => {
    const { container } = render(deleteDialog());
    expect(footerButtons(container)).toEqual(["Cancel", "Delete agentDeleting…"]);
  });
});
