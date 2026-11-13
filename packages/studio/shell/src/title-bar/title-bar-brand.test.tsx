// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { TitleBarBrand } from "./title-bar-brand.tsx";

let media: FakeMediaQueries;
let uninstall: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(1440);
  uninstall = media.install();
});

afterEach(() => {
  unmountAll();
  uninstall();
});

verifies("shell.title-bar", () => {
  describe("TitleBarBrand", () => {
    it("shows the mark and the words Halonic Studio on a wide window, neither a link nor a button", () => {
      const container = render(<TitleBarBrand />);
      expect(container.textContent).toBe("Halonic Studio");
      expect(container.querySelector("a, button")).toBeNull();
      expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    });

    it("keeps only the mark, named Halonic Studio, under 900px", () => {
      const container = render(<TitleBarBrand />);
      act(() => media.resize(800));
      expect(container.textContent).toBe("");
      const mark = container.querySelector("svg");
      expect(mark?.getAttribute("role")).toBe("img");
      expect(mark?.getAttribute("aria-label")).toBe("Halonic Studio");
    });
  });
});
