// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { Avatar } from "./avatar.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
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

verifies("kit.avatar-picture", () => {
  it("draws a picture's centre square on a hidden round canvas instead of the initials", () => {
    const calls: unknown[][] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: (...args: unknown[]) => calls.push(args),
    } as unknown as CanvasRenderingContext2D);
    const picture = { width: 4, height: 2 } as ImageBitmap;

    const avatar = render(<Avatar name="Ada" picture={picture} />).container
      .firstElementChild as HTMLElement;
    const canvas = avatar.querySelector("canvas") as HTMLCanvasElement;

    expect(avatar.textContent).toBe("");
    expect(avatar.getAttribute("aria-hidden")).toBe("true");
    expect(avatar.className.split(" ")).toEqual(
      expect.arrayContaining(["size-7", "rounded-full", "bg-surface-muted"]),
    );
    expect([canvas.width, canvas.height]).toEqual([2, 2]);
    expect(calls).toEqual([[picture, 1, 0, 2, 2, 0, 0, 2, 2]]);
  });

  it("draws a large picture at the tile's size in device pixels, smoothed", () => {
    const calls: unknown[][] = [];
    const context = {
      drawImage: (...args: unknown[]) => calls.push(args),
      imageSmoothingQuality: "low",
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    const picture = { width: 2000, height: 3000 } as ImageBitmap;

    const avatar = render(<Avatar name="Ada" picture={picture} />).container
      .firstElementChild as HTMLElement;
    const canvas = avatar.querySelector("canvas") as HTMLCanvasElement;

    expect([canvas.width, canvas.height]).toEqual([56, 56]);
    expect(context.imageSmoothingQuality).toBe("high");
    expect(calls).toEqual([[picture, 0, 500, 2000, 2000, 0, 0, 56, 56]]);
  });

  it("shows the initials when it has no picture", () => {
    expect(avatarOf("Ada Lovelace").textContent).toBe("AL");
  });
});
