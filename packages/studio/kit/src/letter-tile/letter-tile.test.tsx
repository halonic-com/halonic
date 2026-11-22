// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { LetterTile, type LetterTileProps } from "./letter-tile.tsx";

afterEach(() => {
  unmountAll();
});

const tileOf = (name: string, size?: LetterTileProps["size"]) =>
  render(<LetterTile name={name} size={size} />).container.firstElementChild as HTMLElement;

const classesOf = (tile: HTMLElement) => tile.className.split(" ");

verifies("kit.letter-tile", () => {
  it("shows the first letter, upper case, in accent-text on a 28px accent-soft tile", () => {
    const tile = tileOf(" reporter");
    expect(tile.textContent).toBe("R");
    expect(tile.getAttribute("aria-hidden")).toBe("true");
    expect(classesOf(tile)).toEqual(
      expect.arrayContaining(["size-7", "bg-accent-soft", "text-small", "font-semibold"]),
    );
    expect(classesOf(tile)).toContain("text-accent-text");
    expect(classesOf(tile)).not.toContain("text-accent");
  });

  it("shows ? for an empty name, and a whole emoji", () => {
    expect(tileOf("  ").textContent).toBe("?");
    expect(tileOf("🦊 Fox").textContent).toBe("🦊");
  });

  it("is 48px with the heading size and the medium radius at size lg, in the same colours", () => {
    const tile = tileOf("acme", "lg");
    expect(tile.textContent).toBe("A");
    expect(tile.getAttribute("aria-hidden")).toBe("true");
    expect(classesOf(tile)).toEqual(
      expect.arrayContaining(["size-12", "rounded-md", "text-heading", "bg-accent-soft"]),
    );
    expect(classesOf(tile)).toContain("text-accent-text");
    expect(classesOf(tile)).not.toContain("size-7");
  });
});
