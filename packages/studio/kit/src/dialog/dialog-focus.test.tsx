// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buttonNamed, deleteDialog, fakeDialogPage, restoreDialogPage } from "../test/dialogs.tsx";
import { render, unmountAll } from "../test/render.tsx";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
  vi.useRealTimers();
});

verifies("kit.dialog-return-focus", () => {
  function Opener({ open, opener }: { readonly open: boolean; readonly opener: boolean }) {
    return (
      <>
        <h1 tabIndex={-1}>Agents</h1>
        {opener ? <button type="button">More actions for Sorter</button> : null}
        <button type="button">More actions for Writer</button>
        {open
          ? deleteDialog({
              returnFocus: () => buttonNamed(document, "More actions for Writer"),
            })
          : null}
      </>
    );
  }

  it("moves focus back to the opener on close", () => {
    const { container, rerender } = render(<Opener open={false} opener />);
    const opener = buttonNamed(container, "More actions for Sorter");
    opener.focus();
    rerender(<Opener open opener />);
    expect(document.activeElement).toBe(buttonNamed(container, "Cancel"));
    rerender(<Opener open={false} opener />);
    expect(document.activeElement).toBe(opener);
  });

  it("uses returnFocus when the opener has gone", () => {
    const { container, rerender } = render(<Opener open={false} opener />);
    buttonNamed(container, "More actions for Sorter").focus();
    rerender(<Opener open opener />);
    rerender(<Opener open={false} opener={false} />);
    expect(document.activeElement).toBe(buttonNamed(container, "More actions for Writer"));
  });

  it("falls back to the page's h1 without either", () => {
    const { container, rerender } = render(
      <>
        <h1 tabIndex={-1}>Agents</h1>
        <button type="button">Remove key</button>
      </>,
    );
    buttonNamed(container, "Remove key").focus();
    rerender(
      <>
        <h1 tabIndex={-1}>Agents</h1>
        <button type="button">Remove key</button>
        {deleteDialog()}
      </>,
    );
    rerender(<h1 tabIndex={-1}>Agents</h1>);
    expect(document.activeElement).toBe(container.querySelector("h1"));
  });

  it("skips an opener that sits under inert", () => {
    const { container, rerender } = render(<Opener open={false} opener />);
    const opener = buttonNamed(container, "More actions for Sorter");
    opener.focus();
    rerender(<Opener open opener />);
    opener.setAttribute("inert", "");
    rerender(<Opener open={false} opener />);
    expect(document.activeElement).toBe(buttonNamed(container, "More actions for Writer"));
  });
});
