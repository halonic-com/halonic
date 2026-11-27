// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import type { ReactElement } from "react";
import { afterEach, expect, it } from "vitest";
import { KindIcon, type KindIconName } from "../icons/kind-icon.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { Avatar, type AvatarSize } from "./avatar.tsx";

afterEach(unmountAll);

const avatarOf = (element: ReactElement) =>
  render(element).container.firstElementChild as HTMLElement;

const badgeOf = (avatar: HTMLElement) =>
  avatar.querySelector<HTMLElement>("[data-avatar-badge]")?.className.split(" ");

verifies("kit.avatar-badge", () => {
  it("puts the badge at the tile's bottom right, 16px on a 28px tile and 20px on the larger ones", () => {
    const sizes: [AvatarSize, string, string][] = [
      ["row", "size-7", "size-4"],
      ["header", "size-10", "size-5"],
      ["sidebar", "size-12", "size-5"],
    ];
    for (const [size, tile, badge] of sizes) {
      const avatar = avatarOf(
        <Avatar name="Chief" size={size} badge={<KindIcon kind="approval" />} />,
      );
      expect(avatar.getAttribute("aria-hidden")).toBe("true");
      expect(avatar.className.split(" ")).toContain(tile);
      expect(badgeOf(avatar)).toEqual(expect.arrayContaining([badge, "absolute", "-bottom-0.5"]));
      expect(avatar.querySelector("[data-avatar-badge] svg")).not.toBeNull();
    }
  });

  it("keeps one initial on a 28px tile with a badge, and two on a 40px one", () => {
    const badge = <KindIcon kind="question" />;
    expect(avatarOf(<Avatar name="Sam Lee" badge={badge} />).textContent).toBe("S");
    expect(avatarOf(<Avatar name="Sam Lee" size="header" badge={badge} />).textContent).toBe("SL");
    expect(avatarOf(<Avatar name="Sam Lee" />).textContent).toBe("SL");
  });

  it("draws a glyph instead of the initials on the neutral tile", () => {
    const avatar = avatarOf(<Avatar name="" glyph={<KindIcon kind="unknown" />} />);
    expect(avatar.textContent).toBe("");
    expect(avatar.querySelector("svg circle")).not.toBeNull();
    expect(avatar.className.split(" ")).toEqual(
      expect.arrayContaining(["size-7", "bg-surface-muted", "text-fg-muted"]),
    );
  });

  it("draws a glyph for every kind", () => {
    const kinds: KindIconName[] = [
      "approval",
      "question",
      "action",
      "elsewhere",
      "task",
      "comment",
      "notice",
      "wait",
      "setup",
      "unknown",
    ];
    for (const kind of kinds) {
      const glyph = render(<KindIcon kind={kind} />).container.querySelector("svg");
      expect(glyph?.getAttribute("aria-hidden")).toBe("true");
      expect(glyph?.childElementCount).toBeGreaterThan(0);
    }
  });
});
