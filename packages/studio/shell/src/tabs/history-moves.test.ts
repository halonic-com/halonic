// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { focusPageHeading } from "./history-moves.ts";

afterEach(() => {
  document.body.replaceChildren();
});

verifies("shell.toolbar", () => {
  describe("focusPageHeading", () => {
    it("focuses the page's h1 without making it a Tab stop", () => {
      document.body.innerHTML = "<h1>Studio</h1><main><h1>Workflows</h1></main>";
      focusPageHeading();
      expect(document.activeElement?.textContent).toBe("Workflows");
      expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
    });

    it("keeps a tabindex the heading already has", () => {
      document.body.innerHTML = '<main><h1 tabindex="0">Workflows</h1></main>';
      focusPageHeading();
      expect(document.activeElement?.getAttribute("tabindex")).toBe("0");
    });

    it("leaves focus where it is when the page has no h1 yet", () => {
      document.body.innerHTML = "<button>Back</button><main></main>";
      const back = document.querySelector("button") as HTMLButtonElement;
      back.focus();
      focusPageHeading();
      expect(document.activeElement).toBe(back);
    });
  });
});
