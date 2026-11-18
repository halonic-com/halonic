// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { LetterTile } from "./letter-tile.tsx";

afterEach(() => {
  unmountAll();
});

const tileOf = (name: string) =>
  render(<LetterTile name={name} />).container.firstElementChild as HTMLElement;

verifies("kit.letter-tile", () => {
  it("shows the first letter, upper case, in accent-text on a 28px accent-soft tile", () => {
    const tile = tileOf(" reporter");
    expect(tile.textContent).toBe("R");
    expect(tile.getAttribute("aria-hidden")).toBe("true");
    expect(tile.className).toContain("size-7");
    expect(tile.className).toContain("bg-accent-soft text-small font-semibold text-accent-text");
    expect(tile.className.split(" ")).not.toContain("text-accent");
  });

  it("shows ? for an empty name, and a whole emoji", () => {
    expect(tileOf("  ").textContent).toBe("?");
    expect(tileOf("🦊 Fox").textContent).toBe("🦊");
  });
});
