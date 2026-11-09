// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { expect, it, vi } from "vitest";
import { click, render } from "../test/render.tsx";
import { ExternalLink } from "./external-link.tsx";
import { type OpenExternal, OpenExternalProvider } from "./open-external.tsx";

const audiencePage = "https://console.cloud.google.com/auth/audience?project=halonic-x";

function renderLink(openExternal = vi.fn<OpenExternal>(async () => {})) {
  const { container } = render(
    <OpenExternalProvider openExternal={openExternal}>
      <ExternalLink href={audiencePage}>Audience page</ExternalLink>
    </OpenExternalProvider>,
  );
  const link = container.querySelector("a") as HTMLAnchorElement;
  return { link, openExternal };
}

/** Fires a mouse event with the given button, inside act, and says whether it was cancelled. */
function press(link: HTMLAnchorElement, type: "click" | "auxclick", button: number): boolean {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button });
  act(() => {
    link.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

verifies("kit.external-link", () => {
  it("says where it goes, with ↗ for the eye and words for screen readers", () => {
    const { link } = renderLink();
    expect(link.textContent).toBe("Audience page ↗ (opens in your browser)");
    expect(link.querySelector('[aria-hidden="true"]')?.textContent).toBe(" ↗");
    expect(link.querySelector(".sr-only")?.textContent).toBe(" (opens in your browser)");
  });

  it("has a 48px hit area on a touch screen and is 48px high on a phone", () => {
    const { link } = renderLink();
    expect(link.className).toContain("touch:hit-touch");
    expect(link.className).toContain("phone:min-h-touch");
  });

  it("keeps the address on the link, opening in a new tab without a handle back", () => {
    const { link } = renderLink();
    expect(link.getAttribute("href")).toBe(audiencePage);
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
  });

  it("opens the page through the shell's openExternal service, not in Studio", async () => {
    const { link, openExternal } = renderLink();
    await click(link);
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(audiencePage);
  });

  it("cancels the link's own navigation on a click", () => {
    const { link } = renderLink();
    expect(press(link, "click", 0)).toBe(true);
  });

  it("opens the page on a middle click too", () => {
    const { link, openExternal } = renderLink();
    expect(press(link, "auxclick", 1)).toBe(true);
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(audiencePage);
  });

  it("leaves a right click to the browser, for its menu", () => {
    const { link, openExternal } = renderLink();
    expect(press(link, "auxclick", 2)).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("opens a new browser tab when the shell provides nothing else", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { container } = render(<ExternalLink href={audiencePage}>Audience page</ExternalLink>);
    await click(container.querySelector("a") as HTMLAnchorElement);
    expect(open).toHaveBeenCalledExactlyOnceWith(audiencePage, "_blank", "noopener,noreferrer");
  });
});

verifies("kit.external-link-web-only", () => {
  it.each([
    "javascript:alert(1)",
    "file:///etc/hosts",
    "data:text/html,hello",
    "/settings",
    "not an address",
  ])("refuses %s", (href) => {
    const props = { href, children: "Somewhere" };
    expect(() => ExternalLink(props)).toThrow(
      `ExternalLink opens web pages only, with an http or https address. It got "${href}".`,
    );
  });

  it.each([audiencePage, "http://localhost:4173/"])("accepts %s", (href) => {
    const { container } = render(<ExternalLink href={href}>Somewhere</ExternalLink>);
    expect(container.querySelector("a")?.getAttribute("href")).toBe(href);
  });
});
