// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { Callout } from "./callout.tsx";

afterEach(() => {
  unmountAll();
});

/** The text of the elements `button`'s `aria-describedby` names, in order. */
function descriptionOf(button: HTMLButtonElement | null): string[] {
  const ids = button?.getAttribute("aria-describedby")?.split(" ") ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? "");
}

verifies("kit.callout-action-described-by", () => {
  it("describes each row's action by that row's name", () => {
    const { container } = render(
      <ul>
        {["Paperclip · Halonic", "Paperclip · Acme"].map((label, index) => (
          <li key={label}>
            <p id={`row-${index}`}>{label}</p>
            <Callout
              tone="info"
              action={{ label: "Sign in", describedBy: `row-${index}`, onClick: vi.fn() }}
            >
              Sign in to read and answer from this computer.
            </Callout>
          </li>
        ))}
      </ul>,
    );
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["Sign in", "Sign in"]);
    expect(buttons.map(descriptionOf)).toEqual([["Paperclip · Halonic"], ["Paperclip · Acme"]]);
  });

  it("puts the named element before the Callout's own text", () => {
    const { container } = render(
      <>
        <p id="row">Paperclip · Halonic</p>
        <Callout
          tone="info"
          describeActions
          action={{ label: "Sign in", describedBy: "row", onClick: vi.fn() }}
        >
          Sign in to read and answer from this computer.
        </Callout>
      </>,
    );
    expect(descriptionOf(container.querySelector("button"))).toEqual([
      "Paperclip · Halonic",
      "Sign in to read and answer from this computer.",
    ]);
  });

  it("leaves an action that names nothing without a description", () => {
    const { container } = render(
      <Callout tone="info" action={{ label: "Sign in", onClick: vi.fn() }}>
        Sign in to read and answer from this computer.
      </Callout>,
    );
    expect(container.querySelector("button")?.hasAttribute("aria-describedby")).toBe(false);
  });
});
