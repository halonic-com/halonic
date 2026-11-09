// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { IconTile } from "./icon-tile.tsx";

afterEach(() => {
  unmountAll();
});

verifies("kit.icon-tile", () => {
  it("draws its icon at 20px in accent-text on a 40px halo tile, hidden from screen readers", () => {
    const { container } = render(
      <IconTile>
        <svg data-testid="file-icon" />
      </IconTile>,
    );
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.getAttribute("aria-hidden")).toBe("true");
    expect(tile.className).toContain("size-10");
    expect(tile.className).toContain("rounded-sm bg-halo-tint text-accent-text");
    const box = tile.querySelector('[data-testid="file-icon"]')?.parentElement as HTMLElement;
    expect(box.className).toContain("size-icon-md place-items-center *:size-full");
  });
});
