// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakePopover, isOpen, restorePopover } from "../test/popover.ts";
import { render, unmountAll } from "../test/render.tsx";
import { TOOLTIP_DELAY_MS, Tooltip, tooltipClasses } from "../tooltip/tooltip.tsx";
import { Button, type ButtonUnavailable } from "./button.tsx";
import { firstLineOf } from "./reason-tooltip.ts";

beforeEach(() => {
  fakePopover();
  vi.useFakeTimers();
});

afterEach(() => {
  unmountAll();
  restorePopover();
  vi.useRealTimers();
});

const reasonText = "Finish getting updates first.";

/** Make a version, unavailable while `unavailable` says so, with its reason under it. */
function MakeVersion({ unavailable }: { readonly unavailable: ButtonUnavailable | undefined }) {
  return (
    <>
      <Button unavailable={unavailable}>Make a version</Button>
      <p id="updates-reason">{reasonText}</p>
    </>
  );
}

const unavailable = { reason: "updates-reason" };

function renderUnavailable() {
  const rendered = render(<MakeVersion unavailable={unavailable} />);
  return { ...rendered, ...parts(rendered.container) };
}

function parts(container: HTMLElement) {
  return {
    button: container.querySelector("button") as HTMLButtonElement,
    tooltip: container.querySelector("[role=tooltip]") as HTMLElement | null,
  };
}

function hover(element: Element, pointerType = "mouse") {
  act(() => {
    element.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType }));
  });
  act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
}

function leave(element: Element) {
  act(() => {
    element.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" }));
  });
}

/** Focuses the button as the keyboard would; jsdom only guesses `:focus-visible`. */
function keyboardFocus(button: HTMLElement) {
  const matches = button.matches.bind(button);
  vi.spyOn(button, "matches").mockImplementation((selector) =>
    selector === ":focus-visible" ? true : matches(selector),
  );
  act(() => button.focus());
}

verifies("kit.button-unavailable-tooltip", () => {
  it("shows the reason after 500ms of hover, in the Tooltip's look, and hides when the pointer leaves", () => {
    const { button, tooltip } = renderUnavailable();
    expect(tooltip?.textContent).toBe(reasonText);
    expect(tooltip?.getAttribute("popover")).toBe("manual");
    expect(tooltip?.className).toBe(tooltipClasses);

    act(() => {
      button.dispatchEvent(
        new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }),
      );
    });
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1));
    expect(isOpen(tooltip as HTMLElement)).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(isOpen(tooltip as HTMLElement)).toBe(true);

    leave(button);
    expect(isOpen(tooltip as HTMLElement)).toBe(false);
  });

  it("doesn't show it on touch", () => {
    const { button, tooltip } = renderUnavailable();
    hover(button, "touch");
    expect(isOpen(tooltip as HTMLElement)).toBe(false);
  });

  it("shows it at once on keyboard focus, and Escape hides it without reaching a dialog round it", () => {
    const { button, tooltip } = renderUnavailable();
    const outside = vi.fn();
    document.addEventListener("keydown", outside);

    keyboardFocus(button);
    expect(document.activeElement).toBe(button);
    expect(isOpen(tooltip as HTMLElement)).toBe(true);

    const escapeKey = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      button.dispatchEvent(escapeKey);
    });
    expect(isOpen(tooltip as HTMLElement)).toBe(false);
    expect(escapeKey.defaultPrevented).toBe(true);
    expect(outside).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    document.removeEventListener("keydown", outside);
  });

  it("reads the reason once: described by the visible text only, the tooltip hidden from screen readers", () => {
    const { button, tooltip } = renderUnavailable();
    expect(button.getAttribute("aria-describedby")).toBe("updates-reason");
    expect(tooltip?.getAttribute("aria-hidden")).toBe("true");
  });

  it("changes nothing else on hover: every hover fill waits for the button to be available", () => {
    const { button } = renderUnavailable();
    const hoverClasses = button.className.split(" ").filter((name) => name.includes("hover:"));
    expect(hoverClasses.length).toBeGreaterThan(0);
    for (const name of hoverClasses) {
      expect(name.startsWith("not-aria-disabled:")).toBe(true);
    }
  });

  it("has no tooltip while available, and a reason taken away mid-hover goes with it", () => {
    const { button, rerender, container } = renderUnavailable();
    hover(button);
    expect(isOpen(parts(container).tooltip as HTMLElement)).toBe(true);

    rerender(<MakeVersion unavailable={undefined} />);
    expect(parts(container).tooltip).toBeNull();

    rerender(<MakeVersion unavailable={unavailable} />);
    leave(button);
    hover(button);
    expect(isOpen(parts(container).tooltip as HTMLElement)).toBe(true);
  });

  it("follows the reason's text when it changes", () => {
    const { container, rerender } = render(
      <>
        <Button unavailable={unavailable}>Make a version</Button>
        <p id="updates-reason">Getting updates…</p>
      </>,
    );
    expect(parts(container).tooltip?.textContent).toBe("Getting updates…");
    rerender(
      <>
        <Button unavailable={unavailable}>Make a version</Button>
        <p id="updates-reason">{reasonText}</p>
      </>,
    );
    expect(parts(container).tooltip?.textContent).toBe(reasonText);
  });

  it("has no tooltip when its reason has no text on the page", () => {
    const { container } = render(
      <Button unavailable={{ reason: "missing" }}>Make a version</Button>,
    );
    expect(parts(container).tooltip).toBeNull();
  });

  it("takes the place of a Tooltip round the button while unavailable", () => {
    function Answer({ unavailable }: { readonly unavailable: ButtonUnavailable | undefined }) {
      return (
        <>
          <Tooltip text="Send the reply to Acme" isName>
            {(props) => (
              <Button {...props} unavailable={unavailable}>
                Send the reply to Acme
              </Button>
            )}
          </Tooltip>
          <p id="updates-reason">{reasonText}</p>
        </>
      );
    }
    const { container, rerender } = render(<Answer unavailable={unavailable} />);
    // A pointer over the button is over the Tooltip's wrapper too.
    const { button } = parts(container);
    const shown = () =>
      Array.from(container.querySelectorAll("[role=tooltip]"))
        .filter((tooltip) => isOpen(tooltip))
        .map((tooltip) => tooltip.textContent);

    hover(button);
    expect(shown()).toEqual([reasonText]);
    leave(button);

    rerender(<Answer unavailable={undefined} />);
    hover(button);
    expect(shown()).toEqual(["Send the reply to Acme"]);
  });

  it("uses the first line of the first reason, as the page lays it out", () => {
    const { container } = render(
      <>
        <div id="band" />
        <p id="later">Sandbox isn't ready.</p>
      </>,
    );
    const band = container.querySelector("#band") as HTMLElement;
    // jsdom has no layout; a browser's `innerText` puts each block on its own line.
    Object.defineProperty(band, "innerText", {
      value: "\n  Broken flow can't run:   it has 1 problem.\nFix it before it can run.",
    });
    expect(firstLineOf("band later")).toBe("Broken flow can't run: it has 1 problem.");
    expect(firstLineOf("later band")).toBe("Sandbox isn't ready.");
    expect(firstLineOf("nowhere")).toBeUndefined();
  });

  // C591 row 6: Google setup's Check again said "…sign in again in a terminal:", without the command.
  it("leaves out the sentence that leads into a command, so the tooltip doesn't end on a colon", () => {
    const { container } = render(
      <>
        <Button unavailable={{ reason: "google" }}>Check again</Button>
        <p id="google">
          Studio can't check these again yet. To check them, sign in again in a terminal:
        </p>
        <pre>halonic google sign-in gaccount_1</pre>
        <p id="one-sentence">Run this in a terminal:</p>
        <p id="file">Studio can't edit it yet. Open acme/halonic.yaml:</p>
      </>,
    );
    expect(parts(container).tooltip?.textContent).toBe("Studio can't check these again yet.");
    expect(firstLineOf("one-sentence")).toBe("Run this in a terminal:");
    expect(firstLineOf("file")).toBe("Studio can't edit it yet.");
  });
});
