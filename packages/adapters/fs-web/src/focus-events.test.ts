import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserPageReturns } from "./focus-events.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A window and a document that are only event targets, with a visibility the test sets. */
function stubPage() {
  const page = { visibilityState: "visible" };
  const document = Object.defineProperty(new EventTarget(), "visibilityState", {
    get: () => page.visibilityState,
  });
  const window = new EventTarget();
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", document);
  return { page, window, document };
}

verifies("fs-web.focus-watch", () => {
  describe("browserPageReturns", () => {
    it("hears the window getting focus and the page becoming visible, not hidden", () => {
      const { page, window, document } = stubPage();
      const returned = vi.fn();
      const stop = browserPageReturns(returned);
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      page.visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      expect(returned).toHaveBeenCalledTimes(2);
      stop();
      window.dispatchEvent(new Event("focus"));
      page.visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
      expect(returned).toHaveBeenCalledTimes(2);
    });
  });
});
