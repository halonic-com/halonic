// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { OpenExternal } from "../external-link/open-external.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { ChatText } from "./chat-text.tsx";

afterEach(() => {
  unmountAll();
});

function renderWithLinks(source: string) {
  const openLink = vi.fn<OpenExternal>(async () => {});
  const { container } = render(<ChatText openLink={openLink}>{source}</ChatText>);
  return { container, openLink };
}

/** Clicks with the left button, inside act, and says whether the window's navigation was cancelled. */
function clickLink(link: HTMLAnchorElement): boolean {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  act(() => {
    link.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

verifies("kit.chat-text-links", () => {
  it("opens a link through the caller's function, not by navigating the window", () => {
    const { container, openLink } = renderWithLinks("See [the PR](https://example.com/pr/1).");
    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(link.textContent).toBe("the PR ↗ (opens in your browser)");
    expect(clickLink(link)).toBe(true);
    expect(openLink).toHaveBeenCalledExactlyOnceWith("https://example.com/pr/1");
  });

  it("still shows the full address after the link's words", () => {
    const { container } = renderWithLinks("See [the PR](https://example.com/pr/1).");
    expect(container.textContent).toBe(
      "See the PR ↗ (opens in your browser) (https://example.com/pr/1).",
    );
    const address = container.querySelector("a + span bdi") as HTMLElement;
    expect(address.textContent).toBe("https://example.com/pr/1");
    expect(address.parentElement?.className).toContain("text-fg-muted");
  });

  it("shows a link whose words are its address once, as the link", () => {
    const { container, openLink } = renderWithLinks("[https://example.com](https://example.com)");
    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(container.querySelectorAll("bdi")).toHaveLength(1);
    expect(link.querySelector("bdi")?.textContent).toBe("https://example.com");
    clickLink(link);
    expect(openLink).toHaveBeenCalledExactlyOnceWith("https://example.com");
  });

  it("shows a javascript: link and raw HTML as text", () => {
    const source =
      "[x](javascript:alert(1)) <a href='javascript:alert(1)'>y</a> <script>alert(1)</script>";
    const { container, openLink } = renderWithLinks(source);
    expect(container.textContent).toBe(source);
    expect(container.querySelector("a, button, script, [href], [onclick]")).toBeNull();
    expect(openLink).not.toHaveBeenCalled();
  });

  it("loads no image, not even one inside a link", () => {
    const source =
      '![x](https://example.com/x.png) <img src="https://example.com/y.png"> [![z](https://example.com/z.png)](https://example.com)';
    const { container } = renderWithLinks(source);
    expect(container.querySelector("img, picture, iframe, [src], [srcset]")).toBeNull();
  });
});
