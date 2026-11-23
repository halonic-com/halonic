// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

// Found from the package folder, where Vitest runs each package's tests (see colours.test.ts).
const pageStyles = join(process.cwd(), "src/connect/connect.css");
const pageFile = join(process.cwd(), "connect.html");

/** Every selector in the page's styles, without comments, keyframes or pseudo-elements. */
function selectors(): string[] {
  const css = readFileSync(pageStyles, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const found: string[] = [];
  for (const [, list] of css.matchAll(/([^{}]+)\{/g)) {
    const trimmed = (list as string).trim();
    if (trimmed.startsWith("@")) continue;
    for (const selector of trimmed.split(",")) {
      // A pseudo-element can't be matched, but whether its element matches is what counts.
      found.push(selector.trim().replace(/::[\w-]+$/, ""));
    }
  }
  return found;
}

/**
 * The `tunnel` screen as start-page.ts adds it, filled with everything the 0.1 screens hold plus a
 * section of its own, so a selector that reaches into it finds something to match.
 */
function tunnelScreen(): HTMLElement {
  const main = document.querySelector("main");
  if (main === null) throw new Error("connect.html has no <main>.");
  const tunnel = document.createElement("section");
  tunnel.dataset["screen"] = "tunnel";
  const screens = [...main.querySelectorAll("section[data-screen]")];
  tunnel.innerHTML = `<section>${screens.map((screen) => screen.innerHTML).join("")}</section>`;
  for (const button of tunnel.querySelectorAll("button")) button.setAttribute("aria-busy", "true");
  for (const input of tunnel.querySelectorAll("input")) input.setAttribute("aria-invalid", "true");
  main.append(tunnel);
  return tunnel;
}

beforeEach(() => {
  const parsed = new DOMParser().parseFromString(readFileSync(pageFile, "utf8"), "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
});

describe("the connect page's styles and the phone app (C751, HAL-16709)", () => {
  it("match nothing inside the tunnel screen, where the phone app draws with its own classes", () => {
    const inside = [...tunnelScreen().querySelectorAll("*")];
    const reaching = selectors().filter((selector) =>
      inside.some((element) => element.matches(selector)),
    );
    expect(reaching).toEqual([]);
  });

  it("still style the 0.1 screens", () => {
    const connectButton = document.querySelector('button[data-action="connect"]');
    expect(selectors().some((selector) => connectButton?.matches(selector))).toBe(true);
  });
});
