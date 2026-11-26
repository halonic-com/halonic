// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { PlainValue } from "./plain-value.tsx";
import { WaitBody } from "./wait-card-parts.tsx";

afterEach(unmountAll);

/** Every element under `root` that sets a text colour of its own. */
function ownColours(root: HTMLElement): Element[] {
  return [...root.querySelectorAll("*")].filter((element) =>
    [...element.classList].some((name) => name === "text-fg" || name === "text-fg-muted"),
  );
}

describe("a plain value's colour", () => {
  // Noah's G3 frames (HAL-19450): `text-fg` on the value's own `<bdi>` kept a muted box's text at full strength.
  it("takes its box's colour, so a muted box reads muted", () => {
    const root = render(
      <div className="text-fg-muted">
        <PlainValue text="Sorry your order arrived damaged, Sam." />
      </div>,
    );
    expect(root.querySelector("bdi")?.textContent).toBe("Sorry your order arrived damaged, Sam.");
    expect(ownColours(root).map((element) => element.tagName)).toEqual(["DIV"]);
  });

  it("leaves the quote muted and the live draft at the card's colour", () => {
    const root = render(
      <WaitBody quote="Hi, my order #1042 arrived damaged." draft="Sorry, Sam." live framed />,
    );
    expect(root.querySelector("blockquote")?.classList).toContain("text-fg-muted");
    expect(root.querySelector("blockquote")?.classList).toContain("border-border-strong");
    // Only the quote sets a colour: the draft and both values inherit theirs.
    expect(ownColours(root).map((element) => element.tagName)).toEqual(["BLOCKQUOTE"]);
  });

  it("mutes an answered draft's text, not only its frame", () => {
    const root = render(<WaitBody quote={undefined} draft="Sorry, Sam." live={false} framed />);
    const draft = root.querySelector("[data-draft]");
    expect(draft?.classList).toContain("text-fg-muted");
    expect(ownColours(root)).toEqual([draft]);
  });
});
