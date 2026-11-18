// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { dialogOf, fakeDialogPage, restoreDialogPage } from "../test/dialogs.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { Dialog } from "./dialog.tsx";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
});

/** The texts of the elements the dialog's `aria-describedby` points at, in order. */
function descriptionsOf(dialog: HTMLDialogElement): (string | null | undefined)[] {
  const ids = dialog.getAttribute("aria-describedby")?.split(" ") ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent);
}

/** A "New agent" form whose last line describes it. */
function newAgent(footnote?: string) {
  return (
    <Dialog
      title="New agent"
      form
      confirm={{ label: "Create agent", busyLabel: "Creating…" }}
      onConfirm={() => undefined}
      onCancel={() => undefined}
      describedBy="start-note"
      {...(footnote === undefined ? {} : { footnote })}
    >
      <label>
        Name <input name="name" />
      </label>
      <p id="start-note">It starts with the workspace's default model.</p>
    </Dialog>
  );
}

verifies("kit.dialog-described-by", () => {
  it("describes a form Dialog by the line it names, not by its fields", () => {
    const dialog = dialogOf(render(newAgent()).container);
    expect(descriptionsOf(dialog)).toEqual(["It starts with the workspace's default model."]);
  });

  it("puts the line before the footnote", () => {
    const dialog = dialogOf(render(newAgent("You can rename it later.")).container);
    expect(descriptionsOf(dialog)).toEqual([
      "It starts with the workspace's default model.",
      "You can rename it later.",
    ]);
  });

  it("describes the form sheet on a phone", () => {
    const { container } = render(
      <PresentationProvider presentation="phone">{newAgent()}</PresentationProvider>,
    );
    expect(descriptionsOf(dialogOf(container))).toEqual([
      "It starts with the workspace's default model.",
    ]);
  });
});
