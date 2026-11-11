// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { focusPageHeading } from "./history-moves.ts";

afterEach(() => {
  document.body.replaceChildren();
});

/** Lets the `MutationObserver` that waits for a heading see what changed. */
async function mutationsSeen() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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

    it("waits for the h1 of a page that is still loading, and focuses it when it draws", async () => {
      document.body.innerHTML = "<button>Inbox</button><main></main>";
      (document.querySelector("button") as HTMLButtonElement).focus();
      focusPageHeading();
      document.querySelector("main")?.insertAdjacentHTML("beforeend", "<div><h1>Inbox</h1></div>");
      await mutationsSeen();
      expect(document.activeElement?.textContent).toBe("Inbox");
    });

    it("waits past a heading on a hidden page", async () => {
      document.body.innerHTML = "<main><div hidden><h1>Agents</h1></div><div></div></main>";
      focusPageHeading();
      document
        .querySelector("main > div:last-child")
        ?.insertAdjacentHTML("beforeend", "<h1>Inbox</h1>");
      await mutationsSeen();
      expect(document.activeElement?.textContent).toBe("Inbox");
    });

    it("stops waiting when the focus moved somewhere else first", async () => {
      document.body.innerHTML = "<button>Inbox</button><input><main></main>";
      (document.querySelector("button") as HTMLButtonElement).focus();
      focusPageHeading();
      const field = document.querySelector("input") as HTMLInputElement;
      field.focus();
      document.querySelector("main")?.insertAdjacentHTML("beforeend", "<h1>Inbox</h1>");
      await mutationsSeen();
      expect(document.activeElement).toBe(field);
    });

    it("waits only for the page asked for last", async () => {
      document.body.innerHTML = "<main><div></div><div></div></main>";
      const [inbox, runs] = document.querySelectorAll("main > div");
      focusPageHeading(inbox);
      focusPageHeading(runs);
      inbox?.insertAdjacentHTML("beforeend", "<h1>Inbox</h1>");
      await mutationsSeen();
      expect(document.activeElement).toBe(document.body);
      runs?.insertAdjacentHTML("beforeend", "<h1>Runs</h1>");
      await mutationsSeen();
      expect(document.activeElement?.textContent).toBe("Runs");
    });
  });
});
