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

  it("marks the tile data-picture drawn only once the picture is drawn", () => {
    const picture = { width: 2, height: 2 } as ImageBitmap;
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const undrawn = render(<Avatar name="Ada" picture={picture} />).container
      .firstElementChild as HTMLElement;
    expect(undrawn.hasAttribute("data-picture")).toBe(false);

    getContext.mockReturnValue({
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D);
    const drawn = render(<Avatar name="Ada" picture={picture} />).container
      .firstElementChild as HTMLElement;
    expect(drawn.getAttribute("data-picture")).toBe("drawn");
    expect(avatarOf("Ada").hasAttribute("data-picture")).toBe(false);
  });
});

verifies("kit.avatar-size", () => {
  it("draws the header size on a 40px tile, initials and picture alike", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(1);
    const initials = render(<Avatar name="Ada Lovelace" size="header" />).container
      .firstElementChild as HTMLElement;
    const pictured = render(
      <Avatar name="Ada" size="header" picture={{ width: 400, height: 400 } as ImageBitmap} />,
    ).container.firstElementChild as HTMLElement;
    const canvas = pictured.querySelector("canvas") as HTMLCanvasElement;

    expect(initials.textContent).toBe("AL");
    expect(initials.className.split(" ")).toEqual(
      expect.arrayContaining(["size-10", "text-small"]),
    );
    expect(pictured.className.split(" ")).toContain("size-10");
    expect([canvas.width, canvas.height]).toEqual([40, 40]);
  });

  it("stays 28px in a row by default", () => {
    expect(avatarOf("Ada").className.split(" ")).toContain("size-7");
  });
});

verifies("kit.avatar-inset", () => {
  const pictured = (size: "row" | "header") => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D);
    return render(
      <Avatar name="Ada" size={size} picture={{ width: 400, height: 400 } as ImageBitmap} />,
    ).container.firstElementChild as HTMLElement;
  };

  it("pads a picture 2px inside the 28px tile and 3px inside the 40px tile, round", () => {
    const row = pictured("row");
    const header = pictured("header");

    expect(row.className.split(" ")).toEqual(expect.arrayContaining(["size-7", "p-0.5"]));
    expect(header.className.split(" ")).toEqual(expect.arrayContaining(["size-10", "p-[3px]"]));
    for (const tile of [row, header]) {
      expect(tile.querySelector("canvas")?.className.split(" ")).toContain("rounded-full");
    }
  });

  it("keeps the initials centred, with no padding, at both sizes", () => {
    for (const size of ["row", "header"] as const) {
      const tile = render(<Avatar name="Ada Lovelace" size={size} />).container
        .firstElementChild as HTMLElement;
      const classes = tile.className.split(" ");
      expect(tile.textContent).toBe("AL");
      expect(classes).toEqual(expect.arrayContaining(["flex", "items-center", "justify-center"]));
      expect(classes.some((name) => /^p-/u.test(name))).toBe(false);
    }
  });
});

verifies("kit.avatar-edge", () => {
  const edge = ["ring-1", "ring-inset", "ring-border-strong"];

  it("draws a 1px inset border-strong edge on the initials tile, at both sizes", () => {
    const header = render(<Avatar name="Ada Lovelace" size="header" />).container
      .firstElementChild as HTMLElement;

    expect(avatarOf("Ada Lovelace").className.split(" ")).toEqual(expect.arrayContaining(edge));
    expect(header.className.split(" ")).toEqual(expect.arrayContaining(edge));
  });

  it("draws no edge around a picture", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const pictured = render(<Avatar name="Ada" picture={{ width: 2, height: 2 } as ImageBitmap} />)
      .container.firstElementChild as HTMLElement;

    const classes = pictured.className.split(" ");
    for (const name of edge) expect(classes).not.toContain(name);
  });
});
