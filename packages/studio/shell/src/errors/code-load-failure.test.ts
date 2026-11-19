import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isCodeLoadFailure } from "./code-load-failure.ts";

verifies("shell.code-load-failure", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://computer.local/assets/inbox-page.js",
    "error loading dynamically imported module: https://computer.local/assets/inbox-page.js",
    "Importing a module script failed.",
  ])("counts the browser's failed import %s", (message) => {
    expect(isCodeLoadFailure(new TypeError(message))).toBe(true);
  });

  it("counts Vite's failed preload", () => {
    expect(isCodeLoadFailure(new Error("Unable to preload CSS for /assets/inbox-page.css"))).toBe(
      true,
    );
  });

  it.each([
    new TypeError("steps is undefined"),
    new Error('The view "InboxPage" is not exported by its module (it exports nothing).'),
    new TypeError("Failed to fetch"),
    "Failed to fetch dynamically imported module",
    undefined,
  ])("doesn't count %s", (error) => {
    expect(isCodeLoadFailure(error)).toBe(false);
  });
});
