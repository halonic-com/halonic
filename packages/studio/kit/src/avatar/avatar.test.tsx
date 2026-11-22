// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { Avatar } from "./avatar.tsx";

afterEach(() => {
  unmountAll();
});

const avatarOf = (name: string) =>
  render(<Avatar name={name} />).container.firstElementChild as HTMLElement;

verifies("kit.avatar", () => {
  it("shows the first letters of the first two words on a 28px round muted tile, hidden", () => {
    const avatar = avatarOf("  sofia   marin lopez ");
    expect(avatar.textContent).toBe("SM");
    expect(avatar.getAttribute("aria-hidden")).toBe("true");
    expect(avatar.className.split(" ")).toEqual(
      expect.arrayContaining(["size-7", "rounded-full", "bg-surface-muted", "text-fg-muted"]),
    );
  });

  it("shows one letter for one word, ? for an empty name, and a whole emoji", () => {
    expect(avatarOf("Sofia").textContent).toBe("S");
    expect(avatarOf("   ").textContent).toBe("?");
    expect(avatarOf("🦊 fox").textContent).toBe("🦊F");
  });
});
