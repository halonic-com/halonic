// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { AuthorLine } from "./author-line.tsx";

afterEach(unmountAll);

verifies("kit.author-line", () => {
  it("shows the tinted avatar, then the name semibold in fg and the time muted", () => {
    const line = render(<AuthorLine name="Chief" time="09:00" tint="bg-agent-sky" />).container
      .firstElementChild as HTMLElement;
    expect(line.textContent).toBe("CChief · 09:00");
    expect(line.className.split(" ")).toEqual(
      expect.arrayContaining(["text-small", "text-fg-muted"]),
    );
    expect(line.querySelector("[data-author-name]")?.className).toBe("font-semibold text-fg");
    expect(line.firstElementChild?.className).toContain("bg-agent-sky");
    expect(line.getAttribute("aria-hidden")).toBeNull();
  });

  it("is hidden from screen readers when it's visual only", () => {
    const line = render(<AuthorLine name="Chief" time="09:00" visualOnly />).container
      .firstElementChild as HTMLElement;
    expect(line.getAttribute("aria-hidden")).toBe("true");
    expect(line.querySelector("[data-author-name]")?.getAttribute("aria-hidden")).toBe("true");
  });
});

verifies("kit.author-line-header", () => {
  it("draws the avatar at the header's 40px", () => {
    const line = render(<AuthorLine name="Ravi" time="09:00" size="header" />).container
      .firstElementChild as HTMLElement;
    expect(line.firstElementChild?.className).toContain("size-10");
  });

  it("shows the name alone, with no dot, when there is no time", () => {
    const line = render(<AuthorLine name="Ravi" />).container.firstElementChild as HTMLElement;
    expect(line.textContent).toBe("RRavi");
  });
});
